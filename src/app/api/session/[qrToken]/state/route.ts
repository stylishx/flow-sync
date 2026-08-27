import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/db";
import { SessionModel, TokenModel } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polling fallback for `useQueueStream`. Same shape as the SSE `queue` event. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/session/[qrToken]/state">,
) {
  const { qrToken } = await params;
  await connectToDatabase();

  const session = await SessionModel.findOne({ qrToken })
    .select("_id status currentTokenNumber emergencyDelayMinutes")
    .lean();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const waitingCount = await TokenModel.countDocuments({
    sessionId: session._id,
    status: "waiting",
  });

  return NextResponse.json(
    {
      status: session.status,
      currentTokenNumber: session.currentTokenNumber,
      emergencyDelayMinutes: session.emergencyDelayMinutes,
      waitingCount,
      updatedAt: Date.now(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
