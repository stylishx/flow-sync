import { NextResponse } from "next/server";
import { z } from "zod";

import { attachTokenToHold, consumeHold, orphanHold, restoreHold } from "@/lib/holds";
import { issueToken } from "@/lib/issue";
import { getPaymentProvider } from "@/lib/payments";
import { connectToDatabase } from "@/lib/db";
import { SessionModel } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

/**
 * Step 2 of the Razorpay flow: verify the signature, then issue the token.
 *
 * The browser's claim that payment succeeded is worthless on its own. Only the HMAC,
 * computed here from the key secret, proves Razorpay actually took the money — so
 * nothing is issued before `verifyPayment` returns true.
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
    return NextResponse.json({ error: "Invalid payment response." }, { status: 400 });
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  const verified = await getPaymentProvider().verifyPayment(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  );
  if (!verified) {
    console.error(`[payments] signature verification FAILED for order ${razorpay_order_id}`);
    return NextResponse.json({ error: "Payment could not be verified." }, { status: 400 });
  }

  // Atomic held -> consumed. A retried callback finds nothing and cannot double-issue.
  const hold = await consumeHold(razorpay_order_id);
  if (!hold) {
    await connectToDatabase();
    // Either already processed (return the existing token) or expired.
    const { BookingHoldModel } = await import("@/models");
    const existing = await BookingHoldModel.findOne({ orderId: razorpay_order_id }).lean();
    if (existing?.tokenPublicId) {
      return NextResponse.json({ publicId: existing.tokenPublicId, alreadyIssued: true });
    }
    return NextResponse.json(
      { error: "This booking expired before payment completed. Please contact the clinic." },
      { status: 409 },
    );
  }

  await connectToDatabase();
  const session = await SessionModel.findById(hold.sessionId).select("qrToken").lean();
  if (!session) {
    await orphanHold(razorpay_order_id, razorpay_payment_id);
    return NextResponse.json(
      { error: "That session no longer exists. The clinic will refund you." },
      { status: 409 },
    );
  }

  const result = await issueToken({
    qrToken: session.qrToken,
    name: hold.patient?.name ?? "Patient",
    age: hold.patient?.age ?? 0,
    mobile: hold.patient?.mobile ?? "",
    fingerprint: hold.device?.fingerprint ?? "",
    ipHash: hold.device?.ipHash ?? "",
    source: "online",
    // The hold already claimed the quota slot; claiming again would double-count.
    quotaAlreadyClaimed: true,
    payment: {
      status: "paid",
      amountInPaise: hold.amountInPaise,
      provider: hold.provider,
      orderId: razorpay_order_id,
    },
  });

  if (!result.ok) {
    if (result.code === "duplicate") {
      // Nothing was lost; the patient already holds a token.
      await restoreHold(razorpay_order_id);
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    // Paid, but the session filled or closed in the meantime. Flag for refund rather
    // than pretending it worked.
    await orphanHold(razorpay_order_id, razorpay_payment_id);
    return NextResponse.json(
      { error: `${result.error} Your payment will be refunded by the clinic.` },
      { status: 409 },
    );
  }

  await attachTokenToHold(razorpay_order_id, result.token.publicId, razorpay_payment_id);

  return NextResponse.json(
    { publicId: result.token.publicId, tokenNumber: result.token.tokenNumber },
    { headers: { "Cache-Control": "no-store" } },
  );
}
