import "server-only";

import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { BookingHoldModel, SessionModel, TokenModel, type BookingHold } from "@/models";

/**
 * How long a patient has inside the Razorpay modal before their slot goes back on
 * sale. Long enough for a slow UPI approval, short enough that a walk-in queue is not
 * blocked by someone who wandered off.
 */
export const HOLD_TTL_MS = 10 * 60 * 1000;

export type HoldResult =
  | { ok: true; hold: BookingHold & { _id: Types.ObjectId } }
  | { ok: false; error: string; code: "not_found" | "not_active" | "full" | "duplicate" };

interface CreateHoldInput {
  qrToken: string;
  name: string;
  age: number;
  mobile: string;
  fingerprint: string;
  ipHash: string;
  provider: string;
  orderId: string;
  amountInPaise: number;
}

/**
 * Claims one `onlineQuota` slot for the duration of a checkout.
 *
 * The quota is claimed with a guarded `$inc`, exactly as token issuance does, so two
 * people opening checkout for the last slot cannot both succeed. The alternative —
 * checking availability then creating the hold — would let both through and leave one
 * of them paid but unservable.
 */
export async function createHold(input: CreateHoldInput): Promise<HoldResult> {
  await connectToDatabase();

  const session = await SessionModel.findOne({ qrToken: input.qrToken }).lean();
  if (!session)
    return { ok: false, error: "This clinic session is not available.", code: "not_found" };
  if (session.status !== "active") {
    return {
      ok: false,
      error: "The clinic is not open for booking right now.",
      code: "not_active",
    };
  }

  // Already holding a token, or already mid-checkout.
  const existingToken = await TokenModel.findOne({
    sessionId: session._id,
    activeHold: true,
    $or: [{ "device.fingerprint": input.fingerprint }, { "patient.mobile": input.mobile }],
  })
    .select("_id")
    .lean();
  if (existingToken) {
    return { ok: false, error: "You already have a token for this session.", code: "duplicate" };
  }

  const claimed = await SessionModel.findOneAndUpdate(
    {
      _id: session._id,
      status: "active",
      $expr: {
        $and: [
          { $lt: ["$counters.online", "$onlineQuota"] },
          { $lt: ["$lastIssuedNumber", "$maxPatients"] },
        ],
      },
    },
    { $inc: { "counters.online": 1 } },
    { new: true, lean: true },
  );
  if (!claimed) {
    return {
      ok: false,
      error: "Online slots for today are gone. You can still take a token at the clinic.",
      code: "full",
    };
  }

  try {
    const hold = await BookingHoldModel.create({
      sessionId: session._id,
      clinicId: session.clinicId,
      patient: { name: input.name, age: input.age, mobile: input.mobile },
      device: { fingerprint: input.fingerprint, ipHash: input.ipHash },
      provider: input.provider,
      orderId: input.orderId,
      amountInPaise: input.amountInPaise,
      status: "held",
      expiresAt: new Date(Date.now() + HOLD_TTL_MS),
    });
    return { ok: true, hold: hold.toObject() as BookingHold & { _id: Types.ObjectId } };
  } catch (error) {
    // Lost the race against the per-device / per-mobile unique index. Give the quota
    // slot straight back rather than leaving it stranded.
    await SessionModel.updateOne({ _id: session._id }, { $inc: { "counters.online": -1 } });
    if (error instanceof Error && "code" in error && error.code === 11000) {
      return {
        ok: false,
        error: "A booking is already in progress for this number.",
        code: "duplicate",
      };
    }
    throw error;
  }
}

/**
 * Atomically flips a hold from `held` to `consumed`, returning it only to the caller
 * that won. A duplicate verify callback — Razorpay retries, an impatient double-tap —
 * therefore cannot issue a second token.
 */
export async function consumeHold(
  orderId: string,
): Promise<(BookingHold & { _id: Types.ObjectId }) | null> {
  await connectToDatabase();
  return BookingHoldModel.findOneAndUpdate(
    { orderId, status: "held" },
    { $set: { status: "consumed" } },
    { new: true, lean: true },
  ) as Promise<(BookingHold & { _id: Types.ObjectId }) | null>;
}

/** Undoes a consume when token issuance fails, so the verify can be retried. */
export async function restoreHold(orderId: string): Promise<void> {
  await connectToDatabase();
  await BookingHoldModel.updateOne({ orderId, status: "consumed" }, { $set: { status: "held" } });
}

/**
 * Marks a hold as paid-but-unservable. Only reachable if the session filled or closed
 * between payment and issuance. Surfaced for a manual refund rather than silently
 * swallowed — someone is out of pocket.
 */
export async function orphanHold(orderId: string, paymentId: string): Promise<void> {
  await connectToDatabase();
  await BookingHoldModel.updateOne({ orderId }, { $set: { status: "orphaned", paymentId } });
  console.error(`[payments] REFUND REQUIRED: order ${orderId} paid but no token could be issued.`);
}

export async function attachTokenToHold(orderId: string, publicId: string, paymentId: string) {
  await connectToDatabase();
  await BookingHoldModel.updateOne({ orderId }, { $set: { tokenPublicId: publicId, paymentId } });
}

export interface ReleaseSummary {
  released: number;
}

/**
 * Returns the quota slots of holds whose checkout window has lapsed.
 *
 * Each hold is claimed conditionally before its counter is touched, so an overlapping
 * cron run cannot double-decrement `counters.online`.
 */
export async function releaseExpiredHolds(now: Date = new Date()): Promise<ReleaseSummary> {
  await connectToDatabase();

  const stale = await BookingHoldModel.find({ status: "held", expiresAt: { $lt: now } })
    .select("_id sessionId")
    .limit(200)
    .lean();

  let released = 0;
  for (const hold of stale) {
    const claimed = await BookingHoldModel.findOneAndUpdate(
      { _id: hold._id, status: "held" },
      { $set: { status: "released" } },
      { new: true, lean: true },
    );
    if (!claimed) continue;

    await SessionModel.updateOne({ _id: claimed.sessionId }, { $inc: { "counters.online": -1 } });
    released += 1;
  }

  return { released };
}
