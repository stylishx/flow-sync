import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { reclaimAbandonedBookings } from "@/lib/reclaim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Scheduled cleanup of unpaid online bookings. Wired to Vercel Cron in vercel.json.
 *
 * Disabled outright when CRON_SECRET is unset — an open endpoint that cancels bookings
 * is worse than one that never runs. Both the missing-secret and wrong-secret cases
 * return 404 rather than 401, so probing cannot confirm the route exists.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const summary = await reclaimAbandonedBookings();
    if (summary.reclaimed > 0) {
      console.log(
        `[cron:reclaim] released ${summary.reclaimed} slot(s) across ${summary.sessionsTouched} session(s)`,
      );
    }
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron:reclaim] failed:", error);
    return NextResponse.json({ ok: false, error: "Reclaim failed" }, { status: 500 });
  }
}
