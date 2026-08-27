import { NextResponse } from "next/server";
import { z } from "zod";

import { connectToDatabase } from "@/lib/db";
import { createHold } from "@/lib/holds";
import { normalizeMobile } from "@/lib/mobile";
import { getPaymentProvider } from "@/lib/payments";
import { getClientIpHash, rateLimit } from "@/lib/ratelimit";
import { ClinicModel, SessionModel } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  qrToken: z.string().min(1),
  name: z.string().trim().min(2, "Please enter the patient's name.").max(80),
  age: z.coerce.number().int().min(0).max(130),
  mobile: z.string().trim().min(1),
  fingerprint: z.string().trim().min(1),
});

const IP_LIMIT = 5;
const IP_WINDOW_MS = 10 * 60 * 1000;

/**
 * Step 1 of the Razorpay flow: create the order and reserve a quota slot.
 *
 * The fee comes from the clinic document, never from the request — a client-supplied
 * amount would let anyone book for one rupee.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check the details." },
      { status: 400 },
    );
  }

  const mobile = normalizeMobile(parsed.data.mobile);
  if (!mobile) {
    return NextResponse.json(
      { error: "Enter a valid 10-digit Indian mobile number." },
      { status: 400 },
    );
  }

  const ipHash = await getClientIpHash();
  const limit = await rateLimit(`order:${parsed.data.qrToken}:${ipHash}`, IP_LIMIT, IP_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many booking attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  await connectToDatabase();
  const session = await SessionModel.findOne({ qrToken: parsed.data.qrToken })
    .select("_id clinicId status")
    .lean();
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const clinic = await ClinicModel.findById(session.clinicId).lean();
  if (!clinic?.onlineBooking?.enabled) {
    return NextResponse.json(
      { error: "This clinic does not take online bookings." },
      { status: 400 },
    );
  }

  const amountInPaise = clinic.onlineBooking.feeInPaise ?? 0;
  if (amountInPaise <= 0) {
    return NextResponse.json(
      { error: "Online booking is misconfigured — no fee is set." },
      { status: 400 },
    );
  }

  const provider = getPaymentProvider();

  let order;
  try {
    order = await provider.createOrder(amountInPaise, parsed.data.qrToken);
  } catch (error) {
    console.error("[payments] create-order failed:", error);
    return NextResponse.json(
      { error: "Payments are unavailable right now. Please book at the clinic." },
      { status: 502 },
    );
  }

  // Reserve the slot only after the order exists, so a payment failure cannot strand
  // a hold with no order attached to release it.
  const hold = await createHold({
    qrToken: parsed.data.qrToken,
    name: parsed.data.name,
    age: parsed.data.age,
    mobile,
    fingerprint: parsed.data.fingerprint,
    ipHash,
    provider: order.provider,
    orderId: order.orderId,
    amountInPaise: order.amountInPaise,
  });

  if (!hold.ok) {
    return NextResponse.json({ error: hold.error }, { status: hold.code === "full" ? 409 : 400 });
  }

  return NextResponse.json(
    {
      orderId: order.orderId,
      amountInPaise: order.amountInPaise,
      currency: order.currency,
      keyId: order.publicKey,
      provider: order.provider,
      clinicName: clinic.name,
      prefill: { name: parsed.data.name, contact: mobile },
      expiresAt: hold.hold.expiresAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
