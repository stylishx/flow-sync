import "server-only";

import { connectToDatabase } from "@/lib/db";
import { SessionModel, TokenModel } from "@/models";

/**
 * How long an unpaid online booking may hold its slot. Long enough to finish a
 * checkout on a slow connection, short enough that a browser closed mid-payment does
 * not cost the clinic a sellable slot for the rest of the day.
 */
export const PENDING_PAYMENT_TTL_MS = 15 * 60 * 1000;

export interface ReclaimSummary {
  reclaimed: number;
  sessionsTouched: number;
}

/**
 * Cancels online bookings that were never paid for and returns their quota slot.
 *
 * Without this an abandoned checkout consumes an `onlineQuota` slot permanently — the
 * booking is created before payment completes, and nothing else ever revisits it.
 *
 * Each token is claimed with a conditional `findOneAndUpdate` before its counters are
 * touched, so two overlapping runs (a cron tick and an opportunistic call) cannot
 * double-decrement `counters.online`.
 */
export async function reclaimAbandonedBookings(now: Date = new Date()): Promise<ReclaimSummary> {
  await connectToDatabase();

  const cutoff = new Date(now.getTime() - PENDING_PAYMENT_TTL_MS);

  const candidates = await TokenModel.find({
    status: "waiting",
    activeHold: true,
    source: "online",
    "payment.status": "pending",
    createdAt: { $lt: cutoff },
  })
    .select("_id sessionId")
    .limit(200)
    .lean();

  const touched = new Set<string>();
  let reclaimed = 0;

  for (const candidate of candidates) {
    // Re-assert every condition: the patient may have paid since the query above.
    const claimed = await TokenModel.findOneAndUpdate(
      {
        _id: candidate._id,
        status: "waiting",
        activeHold: true,
        "payment.status": "pending",
      },
      {
        $set: { status: "cancelled", "payment.status": "failed" },
        // Unsetting activeHold drops this token out of the partial unique indexes,
        // freeing the device and mobile to book again.
        $unset: { activeHold: "" },
      },
      { new: true, lean: true },
    );
    if (!claimed) continue;

    await SessionModel.updateOne(
      { _id: claimed.sessionId },
      { $inc: { "counters.cancelled": 1, "counters.online": -1 } },
    );

    reclaimed += 1;
    touched.add(String(claimed.sessionId));
  }

  return { reclaimed, sessionsTouched: touched.size };
}
