"use server";

import { z } from "zod";

import { guardAction } from "@/lib/action-guard";
import { connectToDatabase } from "@/lib/db";
import { issueToken } from "@/lib/issue";
import { normalizeMobile } from "@/lib/mobile";
import { getPaymentProvider } from "@/lib/payments";
import { getClientIpHash, rateLimit } from "@/lib/ratelimit";
import { ClinicModel, SessionModel, TokenModel } from "@/models";

export interface OnlineBookingState {
  error?: string;
  publicId?: string;
  /** Present when the booking is awaiting payment. */
  orderId?: string;
}

const schema = z.object({
  qrToken: z.string().min(1),
  name: z.string().trim().min(2, "Please enter the patient's name.").max(80),
  age: z.coerce.number().int().min(0).max(130),
  mobile: z.string().trim().min(1),
  fingerprint: z.string().trim().min(1),
});

const IP_LIMIT = 3;
const IP_WINDOW_MS = 10 * 60 * 1000;

/**
 * Remote booking. Unlike the walk-in flow this charges a convenience fee, so the token
 * is created with `payment.status: "pending"` and confirmed separately.
 *
 * KNOWN GAP: a pending token holds its slot indefinitely. Nothing reclaims abandoned
 * bookings yet — that needs a scheduled sweep, which belongs in Phase 5 hardening.
 */
async function bookOnlineActionImpl(
  _prev: OnlineBookingState,
  formData: FormData,
): Promise<OnlineBookingState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details." };
  }

  const mobile = normalizeMobile(parsed.data.mobile);
  if (!mobile) return { error: "Enter a valid 10-digit Indian mobile number." };

  const ipHash = await getClientIpHash();
  const limit = await rateLimit(`online:${parsed.data.qrToken}:${ipHash}`, IP_LIMIT, IP_WINDOW_MS);
  if (!limit.allowed) {
    return { error: "Too many booking attempts. Please try again shortly." };
  }

  await connectToDatabase();
  const session = await SessionModel.findOne({ qrToken: parsed.data.qrToken }).lean();
  if (!session) return { error: "This clinic session is no longer available." };

  const clinic = await ClinicModel.findById(session.clinicId).lean();
  if (!clinic) return { error: "Clinic not found." };
  if (!clinic.onlineBooking?.enabled) {
    return { error: "This clinic does not take online bookings." };
  }

  const feeInPaise = clinic.onlineBooking.feeInPaise ?? 0;

  let order;
  try {
    order = await getPaymentProvider().createOrder(feeInPaise, parsed.data.qrToken);
  } catch (error) {
    console.error("[payments] order creation failed:", error);
    return { error: "Payments are unavailable right now. Please book at the clinic." };
  }

  const result = await issueToken({
    qrToken: parsed.data.qrToken,
    name: parsed.data.name,
    age: parsed.data.age,
    mobile,
    fingerprint: parsed.data.fingerprint,
    ipHash,
    source: "online",
    payment: {
      status: "pending",
      amountInPaise: feeInPaise,
      provider: order.provider,
      orderId: order.orderId,
    },
  });

  if (!result.ok) return { error: result.error };
  return { publicId: result.token.publicId, orderId: order.orderId };
}

/**
 * Marks a pending online booking paid.
 *
 * With the stub provider this simply succeeds in development. With a real provider the
 * signature check is what matters — never trust the browser's claim that it paid.
 */
async function confirmPaymentActionImpl(
  publicId: string,
  paymentId: string,
  signature: string,
): Promise<OnlineBookingState> {
  await connectToDatabase();

  const token = await TokenModel.findOne({ publicId }).lean();
  if (!token) return { error: "Booking not found." };
  if (token.payment?.status === "paid") return { publicId };

  const orderId = token.payment?.orderId;
  if (!orderId) return { error: "This booking has no payment attached." };

  const verified = await getPaymentProvider().verifyPayment(orderId, paymentId, signature);
  if (!verified) return { error: "Payment could not be verified." };

  await TokenModel.updateOne(
    { publicId, "payment.status": "pending" },
    { $set: { "payment.status": "paid", "payment.paymentId": paymentId } },
  );

  return { publicId };
}

/* ---------------------------- guarded exports ----------------------------- */
/* Each action runs behind guardAction so an infrastructure failure becomes a
   readable form error instead of an unserialisable 500. */

export async function bookOnlineAction(
  _prev: OnlineBookingState,
  formData: FormData,
): Promise<OnlineBookingState> {
  return guardAction(
    () => bookOnlineActionImpl(_prev, formData),
    (error) => ({ error }),
  );
}

export async function confirmPaymentAction(
  publicId: string,
  paymentId: string,
  signature: string,
): Promise<OnlineBookingState> {
  return guardAction(
    () => confirmPaymentActionImpl(publicId, paymentId, signature),
    (error) => ({ error }),
  );
}
