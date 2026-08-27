import { connectToDatabase } from "@/lib/db";
import { SSE_HEADERS, streamSessionState, type SessionState } from "@/lib/realtime";
import { SessionModel, TokenModel } from "@/models";

// Node runtime: the Mongoose driver uses TCP sockets, which the Edge runtime lacks.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public queue stream, keyed by the session's unguessable qrToken. It emits only
 * aggregate queue state — never a patient's name or number — so it is safe to leave
 * unauthenticated, which is what lets a patient watch it with no login.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/session/[qrToken]/stream">,
) {
  const { qrToken } = await params;
  await connectToDatabase();

  const session = await SessionModel.findOne({ qrToken }).select("_id").lean();
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const sessionId = session._id;

  const read = async (): Promise<SessionState | null> => {
    const [current, waitingCount] = await Promise.all([
      SessionModel.findById(sessionId)
        .select("status currentTokenNumber emergencyDelayMinutes")
        .lean(),
      TokenModel.countDocuments({ sessionId, status: "waiting" }),
    ]);
    if (!current) return null;

    return {
      status: current.status,
      currentTokenNumber: current.currentTokenNumber,
      emergencyDelayMinutes: current.emergencyDelayMinutes,
      waitingCount,
      updatedAt: Date.now(),
    };
  };

  return new Response(streamSessionState(read), { headers: SSE_HEADERS });
}
