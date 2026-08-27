"use server";

import { z } from "zod";
import { guardAction } from "@/lib/action-guard";

import { issueToken } from "@/lib/issue";
import { normalizeMobile } from "@/lib/mobile";
import { getClientIpHash, rateLimit } from "@/lib/ratelimit";

export interface BookingState {
  error?: string;
  publicId?: string;
}

const bookingSchema = z.object({
  qrToken: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(2, "Please enter the patient's name.")
    .max(80, "That name is too long."),
  age: z.coerce.number().int().min(0, "Enter a valid age.").max(130, "Enter a valid age."),
  mobile: z.string().trim().min(1, "Enter a mobile number."),
  fingerprint: z.string().trim().min(1),
});

/** 5 bookings per IP per 10 minutes — generous for a shared clinic connection. */
const IP_LIMIT = 5;
const IP_WINDOW_MS = 10 * 60 * 1000;

async function bookTokenActionImpl(_prev: BookingState, formData: FormData): Promise<BookingState> {
  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details." };
  }

  const mobile = normalizeMobile(parsed.data.mobile);
  if (!mobile) return { error: "Enter a valid 10-digit Indian mobile number." };

  const ipHash = await getClientIpHash();

  // Keyed per session, so a busy clinic on one connection does not exhaust the
  // allowance for a different clinic sharing that IP range.
  const limit = await rateLimit(`book:${parsed.data.qrToken}:${ipHash}`, IP_LIMIT, IP_WINDOW_MS);
  if (!limit.allowed) {
    return {
      error: `Too many bookings from this connection. Try again in ${Math.ceil(
        limit.retryAfterSeconds / 60,
      )} min, or ask at the desk.`,
    };
  }

  const result = await issueToken({
    qrToken: parsed.data.qrToken,
    name: parsed.data.name,
    age: parsed.data.age,
    mobile,
    fingerprint: parsed.data.fingerprint,
    ipHash,
    source: "walkin",
  });

  if (!result.ok) return { error: result.error };
  return { publicId: result.token.publicId };
}

/* ---------------------------- guarded exports ----------------------------- */
/* Each action runs behind guardAction so an infrastructure failure becomes a
   readable form error instead of an unserialisable 500. */

export async function bookTokenAction(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  return guardAction(
    () => bookTokenActionImpl(_prev, formData),
    (error) => ({ error }),
  );
}
