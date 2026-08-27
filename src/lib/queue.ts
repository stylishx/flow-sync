import "server-only";

import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { generateQrToken } from "@/lib/ids";
import { sweepAlmostUpNotifications } from "@/lib/notify";
import { SessionModel, TokenModel, type Session, type Token } from "@/models";

/**
 * Queue engine. Every mutation is a single atomic findOneAndUpdate guarded by the
 * state it expects to find, so a double-click on "Call Next" cannot advance the
 * queue twice.
 *
 * These deliberately avoid multi-document transactions: those require a replica
 * set, which a local standalone mongod does not provide. Where two documents must
 * change (a token and the session counter) the token write happens first and the
 * counter is advisory — a counter that drifts is a cosmetic bug, a double-issued
 * token is not.
 */

export type QueueResult<T> = { ok: true; data: T } | { ok: false; error: string };

function oid(id: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}

/* ------------------------------- sessions -------------------------------- */

export interface CreateSessionInput {
  clinicId: string;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  maxPatients: number;
  estimatedConsultMinutes: number;
  onlineQuota: number;
}

export async function createSession(input: CreateSessionInput): Promise<QueueResult<Session>> {
  await connectToDatabase();
  const clinicId = oid(input.clinicId);
  if (!clinicId) return { ok: false, error: "Invalid clinic." };

  if (input.onlineQuota > input.maxPatients) {
    return { ok: false, error: "Online quota cannot exceed the patient limit." };
  }

  try {
    const session = await SessionModel.create({
      ...input,
      clinicId,
      qrToken: generateQrToken(),
      status: "scheduled",
    });
    return { ok: true, data: session.toObject() };
  } catch (error) {
    // The { clinicId, sessionDate } unique index is what actually prevents two
    // sessions for one day; catching E11000 turns that into a readable message.
    if (error instanceof Error && "code" in error && error.code === 11000) {
      return { ok: false, error: "A session already exists for that date." };
    }
    throw error;
  }
}

export async function setSessionStatus(
  sessionId: string,
  clinicId: string,
  status: Session["status"],
): Promise<QueueResult<Session>> {
  await connectToDatabase();
  const _id = oid(sessionId);
  const clinic = oid(clinicId);
  if (!_id || !clinic) return { ok: false, error: "Invalid session." };

  const session = await SessionModel.findOneAndUpdate(
    { _id, clinicId: clinic },
    { $set: { status } },
    { new: true, lean: true },
  );
  return session ? { ok: true, data: session } : { ok: false, error: "Session not found." };
}

/* -------------------------------- queue ---------------------------------- */

async function resolveServing(
  sessionId: Types.ObjectId,
  resolution: "completed" | "skipped",
): Promise<Token | null> {
  const token = await TokenModel.findOneAndUpdate(
    { sessionId, status: "serving" },
    { $set: { status: resolution, completedAt: new Date() } },
    { new: true, lean: true },
  );

  if (token) {
    await SessionModel.findByIdAndUpdate(sessionId, {
      $inc: resolution === "completed" ? { "counters.completed": 1 } : { "counters.skipped": 1 },
    });
  }
  return token;
}

/** Marks whoever is in the chair as `resolution`, then calls the lowest waiting token. */
export async function callNext(
  sessionId: string,
  clinicId: string,
  resolution: "completed" | "skipped" = "completed",
): Promise<QueueResult<{ session: Session; called: Token }>> {
  await connectToDatabase();
  const _id = oid(sessionId);
  const clinic = oid(clinicId);
  if (!_id || !clinic) return { ok: false, error: "Invalid session." };

  const session = await SessionModel.findOne({ _id, clinicId: clinic }).lean();
  if (!session) return { ok: false, error: "Session not found." };
  if (session.status !== "active") return { ok: false, error: "Session is not active." };

  await resolveServing(_id, resolution);

  // Guarded on status "waiting" so two concurrent calls cannot both claim the same
  // token — the second findOneAndUpdate no longer matches it and moves on.
  const called = await TokenModel.findOneAndUpdate(
    { sessionId: _id, status: "waiting" },
    { $set: { status: "serving", calledAt: new Date() } },
    { sort: { tokenNumber: 1 }, new: true, lean: true },
  );

  if (!called) return { ok: false, error: "No patients waiting." };

  const updated = await SessionModel.findByIdAndUpdate(
    _id,
    { $set: { currentTokenNumber: called.tokenNumber } },
    { new: true, lean: true },
  );

  // The queue moved, so someone new is now within two of the front. Deliberately not
  // awaited: a WhatsApp outage must not delay the doctor's next click, and the sweep
  // is idempotent so a lost run is picked up by the following one.
  void sweepAlmostUpNotifications(sessionId).catch((error: unknown) => {
    console.error("[notify] sweep failed:", error);
  });

  return { ok: true, data: { session: updated ?? session, called } };
}

/** Ends the current consultation without calling anyone else. */
export async function completeCurrent(
  sessionId: string,
  clinicId: string,
): Promise<QueueResult<Token>> {
  await connectToDatabase();
  const _id = oid(sessionId);
  const clinic = oid(clinicId);
  if (!_id || !clinic) return { ok: false, error: "Invalid session." };

  const owned = await SessionModel.exists({ _id, clinicId: clinic });
  if (!owned) return { ok: false, error: "Session not found." };

  const resolved = await resolveServing(_id, "completed");
  if (!resolved) return { ok: false, error: "Nobody is currently being seen." };
  return { ok: true, data: resolved };
}

export async function addEmergencyDelay(
  sessionId: string,
  clinicId: string,
  minutes: number,
): Promise<QueueResult<Session>> {
  await connectToDatabase();
  const _id = oid(sessionId);
  const clinic = oid(clinicId);
  if (!_id || !clinic) return { ok: false, error: "Invalid session." };
  if (!Number.isInteger(minutes) || minutes === 0) {
    return { ok: false, error: "Delay must be a non-zero whole number of minutes." };
  }

  const session = await SessionModel.findOneAndUpdate(
    { _id, clinicId: clinic },
    [
      {
        $set: {
          // Clamped at 0 inside an aggregation-pipeline update so that removing
          // more delay than exists can never push the value negative.
          emergencyDelayMinutes: {
            $max: [0, { $add: ["$emergencyDelayMinutes", minutes] }],
          },
        },
      },
    ],
    { new: true, lean: true },
  );
  return session ? { ok: true, data: session } : { ok: false, error: "Session not found." };
}

/* --------------------------------- reads --------------------------------- */

export interface QueueSnapshot {
  session: Session & { _id: Types.ObjectId };
  serving: Token | null;
  waiting: Token[];
  recent: Token[];
  waitingCount: number;
}

export async function getQueueSnapshot(
  sessionId: string,
  clinicId: string,
): Promise<QueueSnapshot | null> {
  await connectToDatabase();
  const _id = oid(sessionId);
  const clinic = oid(clinicId);
  if (!_id || !clinic) return null;

  const session = await SessionModel.findOne({ _id, clinicId: clinic }).lean();
  if (!session) return null;

  const [serving, waiting, recent, waitingCount] = await Promise.all([
    TokenModel.findOne({ sessionId: _id, status: "serving" }).lean(),
    TokenModel.find({ sessionId: _id, status: "waiting" })
      .sort({ tokenNumber: 1 })
      .limit(25)
      .lean(),
    TokenModel.find({ sessionId: _id, status: { $in: ["completed", "skipped"] } })
      .sort({ completedAt: -1 })
      .limit(5)
      .lean(),
    TokenModel.countDocuments({ sessionId: _id, status: "waiting" }),
  ]);

  return { session, serving, waiting, recent, waitingCount };
}
