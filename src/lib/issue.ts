import "server-only";

import { connectToDatabase } from "@/lib/db";
import { generateQrToken } from "@/lib/ids";
import { SessionModel, TokenModel, type Session, type Token } from "@/models";

export type IssueResult =
  | { ok: true; token: Token; alreadyHeld: boolean }
  | { ok: false; error: string; code: IssueErrorCode };

export type IssueErrorCode =
  "not_found" | "not_active" | "full" | "duplicate" | "rate_limited" | "invalid";

export interface IssueInput {
  qrToken: string;
  name: string;
  age: number;
  mobile: string; // already E.164-normalised
  fingerprint: string;
  ipHash: string;
  source?: "walkin" | "online";
  /** Set for remote bookings; walk-ins stay "not_required". */
  payment?: {
    status: "pending" | "paid";
    amountInPaise: number;
    provider: string;
    orderId: string;
  };
}

/**
 * Issues one token, atomically.
 *
 * The number comes from `$inc` on `Session.lastIssuedNumber`, guarded by `$expr` so
 * the session cannot exceed `maxPatients` even under concurrent scans. Read-then-write
 * would hand two patients the same number the moment one QR code is scanned twice at
 * once, which is the normal case in a waiting room, not an edge case.
 *
 * Numbers can be skipped — if the insert loses a race against the unique indexes, the
 * incremented number is simply not used. A gap in the sequence is cosmetic; a
 * duplicate is not.
 */
export async function issueToken(input: IssueInput): Promise<IssueResult> {
  await connectToDatabase();

  const session = await SessionModel.findOne({ qrToken: input.qrToken }).lean();
  if (!session) return { ok: false, error: "This QR code is not valid.", code: "not_found" };
  if (session.status !== "active") {
    return {
      ok: false,
      error:
        session.status === "closed"
          ? "This session has closed for the day."
          : "The queue is paused. Please ask at the desk.",
      code: "not_active",
    };
  }

  // Cheap pre-check so a returning patient gets their existing token back instead of
  // an error. The unique indexes are still the guarantee; this is the friendly path.
  const existing = await TokenModel.findOne({
    sessionId: session._id,
    activeHold: true,
    $or: [{ "device.fingerprint": input.fingerprint }, { "patient.mobile": input.mobile }],
  }).lean();
  if (existing) return { ok: true, token: existing, alreadyHeld: true };

  const isOnline = (input.source ?? "walkin") === "online";

  // One guarded write claims both the number and, for remote bookings, a slot from
  // the online quota. Splitting these into two updates would let the quota be
  // oversold between them.
  const claimed = await SessionModel.findOneAndUpdate(
    {
      _id: session._id,
      status: "active",
      $expr: {
        $and: [
          { $lt: ["$lastIssuedNumber", "$maxPatients"] },
          ...(isOnline ? [{ $lt: ["$counters.online", "$onlineQuota"] }] : []),
        ],
      },
    },
    {
      $inc: {
        lastIssuedNumber: 1,
        "counters.issued": 1,
        ...(isOnline ? { "counters.online": 1 } : {}),
      },
    },
    { new: true, lean: true },
  );

  if (!claimed) {
    return {
      ok: false,
      error: isOnline
        ? "Online booking is full for today. You can still take a token at the clinic."
        : "Today's queue is full. Please ask at the desk.",
      code: "full",
    };
  }

  try {
    const token = await TokenModel.create({
      sessionId: session._id,
      clinicId: session.clinicId,
      tokenNumber: claimed.lastIssuedNumber,
      publicId: generateQrToken(20),
      patient: { name: input.name, age: input.age, mobile: input.mobile },
      source: isOnline ? "online" : "walkin",
      status: "waiting",
      device: { fingerprint: input.fingerprint, ipHash: input.ipHash },
      payment: input.payment ?? { status: "not_required" },
      activeHold: true,
    });
    return { ok: true, token: token.toObject(), alreadyHeld: false };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      // Lost the race: someone with the same device or mobile inserted first.
      // Hand back their token rather than a confusing error.
      const winner = await TokenModel.findOne({
        sessionId: session._id,
        activeHold: true,
        $or: [{ "device.fingerprint": input.fingerprint }, { "patient.mobile": input.mobile }],
      }).lean();
      if (winner) return { ok: true, token: winner, alreadyHeld: true };
      return {
        ok: false,
        error: "You already have a token for this session.",
        code: "duplicate",
      };
    }
    throw error;
  }
}

export interface PatientView {
  token: Token;
  session: Session;
  peopleAhead: number;
  estimatedMinutes: number;
}

/** Everything the patient status screen needs, in one round trip. */
export async function getPatientView(publicId: string): Promise<PatientView | null> {
  await connectToDatabase();

  const token = await TokenModel.findOne({ publicId }).lean();
  if (!token) return null;

  const session = await SessionModel.findById(token.sessionId).lean();
  if (!session) return null;

  const peopleAhead =
    token.status === "waiting"
      ? await TokenModel.countDocuments({
          sessionId: token.sessionId,
          status: "waiting",
          tokenNumber: { $lt: token.tokenNumber },
        })
      : 0;

  return {
    token,
    session,
    peopleAhead,
    estimatedMinutes: peopleAhead * session.estimatedConsultMinutes + session.emergencyDelayMinutes,
  };
}
