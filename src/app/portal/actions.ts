"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { guardAction } from "@/lib/action-guard";
import { connectToDatabase } from "@/lib/db";
import {
  createPortalSession,
  destroyPortalSession,
  getPortalClinicId,
  hashPasscode,
  verifyPasscode,
} from "@/lib/auth";
import {
  addEmergencyDelay,
  callNext,
  completeCurrent,
  createSession,
  setSessionStatus,
} from "@/lib/queue";
import { normalizeMobile } from "@/lib/mobile";
import { getClientIpHash, rateLimit } from "@/lib/ratelimit";
import { slugify, validateSlug } from "@/lib/slug";
import { ClinicModel } from "@/models";

export interface ActionState {
  error?: string;
  success?: string;
}

/** Every mutating action funnels through this so no route can forget the check. */
async function requireClinicId(): Promise<string> {
  const clinicId = await getPortalClinicId();
  if (!clinicId) redirect("/portal/login");
  return clinicId;
}

/* --------------------------------- auth ---------------------------------- */

const loginSchema = z.object({
  slug: z.string().min(1, "Enter your clinic ID."),
  passcode: z.string().min(4, "Passcode must be at least 4 characters."),
});

async function loginActionImpl(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    slug: formData.get("slug"),
    passcode: formData.get("passcode"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }

  await connectToDatabase();
  // portalPasscodeHash is `select: false`, so it must be asked for explicitly.
  const clinic = await ClinicModel.findOne({ slug: parsed.data.slug.toLowerCase().trim() })
    .select("+portalPasscodeHash")
    .lean();

  // Same message whether the clinic is missing or the passcode is wrong, so the
  // form cannot be used to enumerate which clinic IDs exist.
  const invalid: ActionState = { error: "Incorrect clinic ID or passcode." };
  if (!clinic?.portalPasscodeHash) return invalid;
  if (!(await verifyPasscode(parsed.data.passcode, clinic.portalPasscodeHash))) return invalid;
  if (!clinic.isActive) return { error: "This clinic is deactivated." };

  await createPortalSession(String(clinic._id));
  redirect("/portal");
}

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter the clinic name.").max(120),
  doctorName: z.string().trim().min(2, "Enter the doctor's name.").max(120),
  specialization: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(1, "Enter a contact number."),
  slug: z.string().trim().min(1, "Enter a clinic ID."),
  city: z.string().trim().max(80).optional(),
  passcode: z
    .string()
    .min(6, "Passcode must be at least 6 characters.")
    .max(128, "Passcode is too long."),
  confirmPasscode: z.string(),
});

/** 5 registrations per IP per hour. Creating clinics is not a high-frequency action. */
const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

/**
 * Creates a clinic and signs the staff straight in.
 *
 * The slug is the clinic's public identity — it is what staff type to log in and what
 * appears in the online booking URL — so it is validated against a reserved list and
 * the unique index, not just checked for availability. A pre-check would race two
 * simultaneous registrations onto the same slug.
 */
async function registerActionImpl(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  const input = parsed.data;

  if (input.passcode !== input.confirmPasscode) {
    return { error: "The two passcodes do not match." };
  }

  const phone = normalizeMobile(input.phone);
  if (!phone) return { error: "Enter a valid 10-digit Indian mobile number." };

  const slug = slugify(input.slug);
  const slugProblem = validateSlug(slug);
  if (slugProblem) return { error: slugProblem };

  const ipHash = await getClientIpHash();
  const limit = await rateLimit(`register:${ipHash}`, REGISTER_LIMIT, REGISTER_WINDOW_MS);
  if (!limit.allowed) {
    return { error: "Too many registrations from this connection. Please try again later." };
  }

  await connectToDatabase();

  let clinic;
  try {
    clinic = await ClinicModel.create({
      name: input.name,
      slug,
      doctorName: input.doctorName,
      specialization: input.specialization || undefined,
      phone,
      address: input.city ? { city: input.city } : undefined,
      portalPasscodeHash: await hashPasscode(input.passcode),
      isActive: true,
    });
  } catch (error) {
    // The unique index on slug is the real guard; E11000 is the only way to learn the
    // name was taken without a check-then-write race.
    if (error instanceof Error && "code" in error && error.code === 11000) {
      return { error: `The clinic ID "${slug}" is already taken. Please choose another.` };
    }
    throw error;
  }

  await createPortalSession(String(clinic._id));
  redirect("/portal");
}

export async function logoutAction(): Promise<void> {
  await destroyPortalSession();
  redirect("/portal/login");
}

/* ------------------------------- settings -------------------------------- */

const settingsSchema = z.object({
  name: z.string().trim().min(2, "Enter the clinic name.").max(120),
  doctorName: z.string().trim().min(2, "Enter the doctor's name.").max(120),
  specialization: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(1, "Enter a contact number."),
  city: z.string().trim().max(80).optional(),
  onlineEnabled: z.enum(["true", "false"]),
  // Rupees as typed by a human; converted to integer paise below.
  onlineFeeRupees: z.string().trim(),
  whatsappEnabled: z.enum(["true", "false"]),
  whatsappPhoneNumberId: z.string().trim().max(64).optional(),
  whatsappTemplateName: z.string().trim().max(120).optional(),
});

async function updateClinicActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const clinicId = await requireClinicId();

  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  const input = parsed.data;

  const phone = normalizeMobile(input.phone);
  if (!phone) return { error: "Enter a valid 10-digit Indian mobile number." };

  const rupees = Number(input.onlineFeeRupees === "" ? "0" : input.onlineFeeRupees);
  if (!Number.isFinite(rupees) || rupees < 0) return { error: "Enter a valid fee." };
  // Rounded to whole paise: 30.005 rupees is not a representable amount, and storing
  // a fractional paise would drift against whatever the gateway actually charges.
  const feeInPaise = Math.round(rupees * 100);
  if (feeInPaise > 10_000_00) return { error: "That convenience fee looks too high." };

  const onlineEnabled = input.onlineEnabled === "true";
  const whatsappEnabled = input.whatsappEnabled === "true";

  if (whatsappEnabled && !input.whatsappPhoneNumberId) {
    return { error: "A WhatsApp phone number ID is required to enable notifications." };
  }

  await connectToDatabase();
  const updated = await ClinicModel.findByIdAndUpdate(
    clinicId,
    {
      $set: {
        name: input.name,
        doctorName: input.doctorName,
        specialization: input.specialization || undefined,
        phone,
        "address.city": input.city || undefined,
        "onlineBooking.enabled": onlineEnabled,
        "onlineBooking.feeInPaise": feeInPaise,
        "whatsapp.enabled": whatsappEnabled,
        "whatsapp.phoneNumberId": input.whatsappPhoneNumberId || undefined,
        "whatsapp.templateName": input.whatsappTemplateName || undefined,
      },
    },
    { new: true, lean: true },
  );
  if (!updated) return { error: "Clinic not found." };

  revalidatePath("/portal/settings");
  revalidatePath("/portal");
  return { success: "Settings saved." };
}

const passcodeSchema = z.object({
  currentPasscode: z.string().min(1, "Enter your current passcode."),
  newPasscode: z.string().min(6, "New passcode must be at least 6 characters.").max(128),
  confirmPasscode: z.string(),
});

async function changePasscodeActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const clinicId = await requireClinicId();

  const parsed = passcodeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  if (parsed.data.newPasscode !== parsed.data.confirmPasscode) {
    return { error: "The two new passcodes do not match." };
  }

  await connectToDatabase();
  const clinic = await ClinicModel.findById(clinicId).select("+portalPasscodeHash").lean();
  if (!clinic?.portalPasscodeHash) return { error: "Clinic not found." };

  // Requiring the current passcode means a walk-up on an unlocked reception machine
  // cannot lock the real staff out.
  if (!(await verifyPasscode(parsed.data.currentPasscode, clinic.portalPasscodeHash))) {
    return { error: "Current passcode is incorrect." };
  }

  await ClinicModel.updateOne(
    { _id: clinicId },
    { $set: { portalPasscodeHash: await hashPasscode(parsed.data.newPasscode) } },
  );

  // NOTE: existing portal cookies stay valid until they expire — the session cookie is
  // stateless and signed with the app secret, not with the passcode. Revoking other
  // devices immediately would need a per-clinic token version in the cookie payload.
  return {
    success: "Passcode changed. Other signed-in devices keep access until their session expires.",
  };
}

/* ------------------------------- sessions -------------------------------- */

const createSessionSchema = z.object({
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Pick a valid start time."),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Pick a valid end time."),
  maxPatients: z.coerce.number().int().min(1).max(500),
  estimatedConsultMinutes: z.coerce.number().int().min(1).max(120),
  onlineQuota: z.coerce.number().int().min(0).max(500),
});

async function createSessionActionImpl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const clinicId = await requireClinicId();

  const parsed = createSessionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid session details." };
  }
  const input = parsed.data;

  if (input.endTime <= input.startTime) {
    return { error: "End time must be after the start time." };
  }

  const result = await createSession({
    clinicId,
    // Parsed as UTC midnight to match how Session.sessionDate is stored; using
    // `new Date("2026-08-27")` local-time would drift a day either side of UTC.
    sessionDate: new Date(`${input.sessionDate}T00:00:00.000Z`),
    startTime: input.startTime,
    endTime: input.endTime,
    maxPatients: input.maxPatients,
    estimatedConsultMinutes: input.estimatedConsultMinutes,
    onlineQuota: input.onlineQuota,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/portal");
  return { success: "Session created." };
}

async function setSessionStatusActionImpl(
  sessionId: string,
  status: "scheduled" | "active" | "paused" | "closed",
): Promise<ActionState> {
  const clinicId = await requireClinicId();
  const result = await setSessionStatus(sessionId, clinicId, status);
  if (!result.ok) return { error: result.error };

  revalidatePath("/portal");
  revalidatePath(`/portal/session/${sessionId}`);
  return { success: `Session ${status}.` };
}

/* -------------------------------- queue ---------------------------------- */

async function callNextActionImpl(sessionId: string): Promise<ActionState> {
  const clinicId = await requireClinicId();
  const result = await callNext(sessionId, clinicId, "completed");
  if (!result.ok) return { error: result.error };

  revalidatePath(`/portal/session/${sessionId}`);
  return { success: `Now serving token #${result.data.called.tokenNumber}.` };
}

async function skipCurrentActionImpl(sessionId: string): Promise<ActionState> {
  const clinicId = await requireClinicId();
  const result = await callNext(sessionId, clinicId, "skipped");
  if (!result.ok) return { error: result.error };

  revalidatePath(`/portal/session/${sessionId}`);
  return { success: `Skipped. Now serving token #${result.data.called.tokenNumber}.` };
}

async function completeCurrentActionImpl(sessionId: string): Promise<ActionState> {
  const clinicId = await requireClinicId();
  const result = await completeCurrent(sessionId, clinicId);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/portal/session/${sessionId}`);
  return { success: `Token #${result.data.tokenNumber} completed.` };
}

async function addDelayActionImpl(sessionId: string, minutes: number): Promise<ActionState> {
  const clinicId = await requireClinicId();
  const result = await addEmergencyDelay(sessionId, clinicId, minutes);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/portal/session/${sessionId}`);
  return {
    success:
      result.data.emergencyDelayMinutes === 0
        ? "Delay cleared."
        : `Delay is now ${result.data.emergencyDelayMinutes} min.`,
  };
}

/* ---------------------------- guarded exports ----------------------------- */
/* Each action runs behind guardAction so an infrastructure failure becomes a
   readable form error instead of an unserialisable 500. */

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardAction(
    () => loginActionImpl(_prev, formData),
    (error) => ({ error }),
  );
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardAction(
    () => registerActionImpl(_prev, formData),
    (error) => ({ error }),
  );
}

export async function updateClinicAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guardAction(
    () => updateClinicActionImpl(_prev, formData),
    (error) => ({ error }),
  );
}

export async function changePasscodeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guardAction(
    () => changePasscodeActionImpl(_prev, formData),
    (error) => ({ error }),
  );
}

export async function createSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guardAction(
    () => createSessionActionImpl(_prev, formData),
    (error) => ({ error }),
  );
}

export async function setSessionStatusAction(
  sessionId: string,
  status: "scheduled" | "active" | "paused" | "closed",
): Promise<ActionState> {
  return guardAction(
    () => setSessionStatusActionImpl(sessionId, status),
    (error) => ({ error }),
  );
}

export async function callNextAction(sessionId: string): Promise<ActionState> {
  return guardAction(
    () => callNextActionImpl(sessionId),
    (error) => ({ error }),
  );
}

export async function skipCurrentAction(sessionId: string): Promise<ActionState> {
  return guardAction(
    () => skipCurrentActionImpl(sessionId),
    (error) => ({ error }),
  );
}

export async function completeCurrentAction(sessionId: string): Promise<ActionState> {
  return guardAction(
    () => completeCurrentActionImpl(sessionId),
    (error) => ({ error }),
  );
}

export async function addDelayAction(sessionId: string, minutes: number): Promise<ActionState> {
  return guardAction(
    () => addDelayActionImpl(sessionId, minutes),
    (error) => ({ error }),
  );
}
