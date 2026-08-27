import "server-only";

import { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { generateQrToken } from "@/lib/ids";
import { sweepAlmostUpNotifications } from "@/lib/notify";
import { QUEUE_ORDER_STEP, SessionModel, TokenModel, type Session, type Token } from "@/models";

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
    // Ordered by queueOrder, not tokenNumber — that is what lets a recalled patient
    // take a position that is not their original one.
    { sort: { queueOrder: 1 }, new: true, lean: true },
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

/**
 * Parks the patient currently in the chair: they were called and were not present.
 *
 * Unlike `skipped` this is reversible — the token keeps its number and stays visible
 * to staff, so the patient can be slotted back in when they turn up. It deliberately
 * does NOT call the next patient; the compounder decides when to move on.
 */
export async function parkCurrent(
  sessionId: string,
  clinicId: string,
): Promise<QueueResult<Token>> {
  await connectToDatabase();
  const _id = oid(sessionId);
  const clinic = oid(clinicId);
  if (!_id || !clinic) return { ok: false, error: "Invalid session." };

  const owned = await SessionModel.exists({ _id, clinicId: clinic });
  if (!owned) return { ok: false, error: "Session not found." };

  const parked = await TokenModel.findOneAndUpdate(
    { sessionId: _id, status: "serving" },
    { $set: { status: "parked", parkedAt: new Date() } },
    { new: true, lean: true },
  );
  if (!parked) return { ok: false, error: "Nobody is currently being called." };

  await SessionModel.findByIdAndUpdate(_id, { $inc: { "counters.parked": 1 } });
  return { ok: true, data: parked };
}

/**
 * Returns a parked patient to the queue, `afterCount` places from the front.
 *
 * The new `queueOrder` is the midpoint between the tokens that will sit either side
 * of them. That is exactly why queueOrder is spaced by QUEUE_ORDER_STEP at issuance:
 * there is always room to insert without disturbing anyone else's position — or,
 * crucially, their printed token number.
 */
export async function recallParked(
  sessionId: string,
  clinicId: string,
  publicId: string,
  afterCount: number,
): Promise<QueueResult<Token>> {
  await connectToDatabase();
  const _id = oid(sessionId);
  const clinic = oid(clinicId);
  if (!_id || !clinic) return { ok: false, error: "Invalid session." };
  if (!Number.isInteger(afterCount) || afterCount < 0 || afterCount > 50) {
    return { ok: false, error: "Invalid recall position." };
  }

  const owned = await SessionModel.exists({ _id, clinicId: clinic });
  if (!owned) return { ok: false, error: "Session not found." };

  const parked = await TokenModel.findOne({
    sessionId: _id,
    publicId,
    status: "parked",
  }).lean();
  if (!parked) return { ok: false, error: "That patient is no longer on hold." };

  // The tokens they will be placed among.
  const ahead = await TokenModel.find({ sessionId: _id, status: "waiting" })
    .sort({ queueOrder: 1 })
    .limit(afterCount + 1)
    .select("queueOrder")
    .lean();

  // Clamp to the queue length. Asking for "after 5" when only two people are waiting
  // must place the patient LAST, not first — indexing past the end would leave
  // `before` at 0 and send them straight to the front.
  const index = Math.min(afterCount, ahead.length);
  const before = index > 0 ? (ahead[index - 1]?.queueOrder ?? 0) : 0;
  const after = ahead[index]?.queueOrder;

  // Midpoint when there is someone behind them, otherwise a step past the last token.
  const queueOrder = after === undefined ? before + QUEUE_ORDER_STEP : (before + after) / 2;

  const recalled = await TokenModel.findOneAndUpdate(
    { _id: parked._id, status: "parked" },
    { $set: { status: "waiting", queueOrder }, $unset: { parkedAt: "" } },
    { new: true, lean: true },
  );
  if (!recalled) return { ok: false, error: "That patient is no longer on hold." };

  await SessionModel.findByIdAndUpdate(_id, { $inc: { "counters.parked": -1 } });
  return { ok: true, data: recalled };
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
  parked: Token[];
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

  const [serving, waiting, parked, recent, waitingCount] = await Promise.all([
    TokenModel.findOne({ sessionId: _id, status: "serving" }).lean(),
    TokenModel.find({ sessionId: _id, status: "waiting" }).sort({ queueOrder: 1 }).limit(25).lean(),
    TokenModel.find({ sessionId: _id, status: "parked" }).sort({ tokenNumber: 1 }).lean(),
    TokenModel.find({ sessionId: _id, status: { $in: ["completed", "skipped"] } })
      .sort({ completedAt: -1 })
      .limit(5)
      .lean(),
    TokenModel.countDocuments({ sessionId: _id, status: "waiting" }),
  ]);

  return { session, serving, waiting, parked, recent, waitingCount };
}
