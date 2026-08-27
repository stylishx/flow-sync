import "server-only";

import { connectToDatabase } from "@/lib/db";
import { env } from "@/lib/env";
import { ClinicModel, SessionModel, TokenModel } from "@/models";

import { metaProvider } from "./meta";
import { stubProvider } from "./stub";
import type { NotificationProvider } from "./types";

export type { NotificationMessage, NotificationProvider, SendResult } from "./types";

export function getNotificationProvider(): NotificationProvider {
  return env.NOTIFY_PROVIDER === "meta" ? metaProvider : stubProvider;
}

/** How close to the front a patient must be before we message them. */
const ALMOST_UP_THRESHOLD = 2;

/**
 * Messages every waiting patient who has come within ALMOST_UP_THRESHOLD of the front
 * and has not already been told.
 *
 * Called after the queue moves. Two properties matter:
 *
 * - **Idempotent.** The `notify.twoAwaySentAt` stamp is claimed with a conditional
 *   `findOneAndUpdate` BEFORE the message is sent, so two concurrent sweeps cannot
 *   both message the same person. A patient who gets two "you're nearly up" texts
 *   stops trusting the system.
 * - **Non-blocking.** Failures are counted and swallowed. A WhatsApp outage must never
 *   stop the doctor from calling the next patient.
 */
export async function sweepAlmostUpNotifications(sessionId: string): Promise<number> {
  await connectToDatabase();

  const session = await SessionModel.findById(sessionId).lean();
  if (!session || session.status !== "active") return 0;

  const clinic = await ClinicModel.findById(session.clinicId).lean();
  if (!clinic?.whatsapp?.enabled && env.NOTIFY_PROVIDER === "meta") {
    // Clinic has not switched notifications on; the stub still runs in development
    // so the trigger logic stays observable.
    return 0;
  }

  // Position, not token number. Once a held patient is slotted back in, their number
  // and their place in the queue disagree, so "within two of the front" has to be
  // read off queueOrder — otherwise the wrong people get messaged.
  const candidates = await TokenModel.find({
    sessionId,
    status: "waiting",
    "notify.twoAwaySentAt": { $exists: false },
  })
    .sort({ queueOrder: 1 })
    .limit(ALMOST_UP_THRESHOLD + 1)
    .lean();

  if (candidates.length === 0) return 0;

  const provider = getNotificationProvider();
  let sent = 0;

  for (const candidate of candidates) {
    // Claim first. If another sweep already stamped it, this returns null and we skip.
    const claimed = await TokenModel.findOneAndUpdate(
      { _id: candidate._id, "notify.twoAwaySentAt": { $exists: false } },
      { $set: { "notify.twoAwaySentAt": new Date() } },
      { new: true, lean: true },
    );
    if (!claimed) continue;

    const peopleAhead = await TokenModel.countDocuments({
      sessionId,
      status: "waiting",
      queueOrder: { $lt: claimed.queueOrder },
    });

    const result = await provider.send({
      kind: "almost_up",
      to: claimed.patient?.mobile ?? "",
      patientName: claimed.patient?.name ?? "Patient",
      tokenNumber: claimed.tokenNumber,
      peopleAhead,
      clinicName: clinic?.name ?? "the clinic",
    });

    if (result.ok) {
      sent += 1;
    } else {
      // Release the stamp so a retryable failure can be picked up by the next sweep;
      // a permanent failure keeps the stamp and is counted instead of looping forever.
      await TokenModel.updateOne(
        { _id: claimed._id },
        result.retryable
          ? { $unset: { "notify.twoAwaySentAt": "" }, $inc: { "notify.failures": 1 } }
          : { $inc: { "notify.failures": 1 } },
      );
      console.error(`[notify] token #${claimed.tokenNumber}: ${result.error}`);
    }
  }

  return sent;
}
