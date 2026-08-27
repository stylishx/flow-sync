import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  ClockIcon,
  StethoscopeIcon,
  UsersIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { connectToDatabase } from "@/lib/db";
import { formatWait } from "@/lib/wait";
import { ClinicModel, SessionModel, TokenModel } from "@/models";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/c/[slug]/sessions">): Promise<Metadata> {
  const { slug } = await params;
  await connectToDatabase();
  const clinic = await ClinicModel.findOne({ slug }).lean();
  return {
    title: clinic ? `Sessions — ${clinic.name}` : "Sessions — Flow-Sync",
    robots: { index: false, follow: false },
  };
}

/** UTC midnight of today, matching how Session.sessionDate is stored. */
function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const STATUS_LABEL: Record<string, { text: string; variant: "default" | "secondary" | "outline" }> =
  {
    active: { text: "Open now", variant: "default" },
    scheduled: { text: "Upcoming", variant: "secondary" },
    paused: { text: "Paused", variant: "outline" },
    closed: { text: "Closed", variant: "outline" },
  };

export default async function SessionsPage({ params }: PageProps<"/c/[slug]/sessions">) {
  const { slug } = await params;
  await connectToDatabase();

  const clinic = await ClinicModel.findOne({ slug, isActive: true }).lean();
  if (!clinic) notFound();

  // Today and forward only. A closed session from last week helps nobody choose.
  const sessions = await SessionModel.find({
    clinicId: clinic._id,
    sessionDate: { $gte: todayUtcMidnight() },
    status: { $in: ["active", "scheduled", "paused"] },
  })
    .sort({ sessionDate: 1, startTime: 1 })
    .limit(20)
    .lean();

  // One grouped count instead of a query per session — a clinic with a fortnight of
  // sessions would otherwise fan out badly.
  const waitingCounts = new Map<string, number>();
  if (sessions.length > 0) {
    const grouped = await TokenModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { sessionId: { $in: sessions.map((s) => s._id) }, status: "waiting" } },
      { $group: { _id: "$sessionId", count: { $sum: 1 } } },
    ]);
    for (const row of grouped) waitingCounts.set(String(row._id), row.count);
  }

  const onlineEnabled = Boolean(clinic.onlineBooking?.enabled);
  const feeRupees = ((clinic.onlineBooking?.feeInPaise ?? 0) / 100).toFixed(2);

  return (
    <main className="flex min-h-dvh flex-col items-center page-gradient px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <header className="space-y-1 text-center">
          <span className="mx-auto flex size-12 animate-brand-gradient items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-brand">
            <StethoscopeIcon className="size-6" />
          </span>
          <h1 className="pt-2 text-2xl font-semibold tracking-tight">{clinic.name}</h1>
          <p className="text-muted-foreground">
            {clinic.doctorName}
            {clinic.specialization ? ` · ${clinic.specialization}` : ""}
          </p>
          {clinic.address?.city ? (
            <p className="text-sm text-muted-foreground">{clinic.address.city}</p>
          ) : null}
        </header>

        {sessions.length === 0 ? (
          <Card className="border-dashed border-border/60">
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <CalendarDaysIcon className="size-8 text-muted-foreground" />
              <p className="font-medium">No sessions scheduled</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Nothing is open today. Please check back later, or call the clinic.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {sessions.map((session) => {
              const waiting = waitingCounts.get(String(session._id)) ?? 0;
              const issued = session.counters?.issued ?? 0;
              const slotsLeft = Math.max(0, session.maxPatients - issued);
              const onlineLeft = Math.max(
                0,
                (session.onlineQuota ?? 0) - (session.counters?.online ?? 0),
              );
              const isOpen = session.status === "active";
              const canBookOnline = isOpen && onlineEnabled && onlineLeft > 0;
              const label = STATUS_LABEL[session.status] ?? STATUS_LABEL.scheduled;
              const waitMinutes =
                waiting * session.estimatedConsultMinutes + session.emergencyDelayMinutes;

              return (
                <li key={String(session._id)}>
                  <Card>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <div>
                          <p className="font-medium">
                            {session.sessionDate.toISOString().slice(0, 10)}
                          </p>
                          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <ClockIcon className="size-3.5" />
                            {session.startTime} – {session.endTime}
                          </p>
                        </div>
                        <Badge variant={label.variant} className="ml-auto">
                          {isOpen ? (
                            <span className="mr-1.5 size-1.5 animate-pulse rounded-full bg-current" />
                          ) : null}
                          {label.text}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Stat
                          label="Now serving"
                          value={isOpen ? String(session.currentTokenNumber || "—") : "—"}
                        />
                        <Stat label="Waiting" value={String(waiting)} icon />
                        <Stat label="Slots left" value={`${slotsLeft}/${session.maxPatients}`} />
                        <Stat
                          label="Est. wait"
                          value={isOpen ? formatWait(waitMinutes).replace("~", "") : "—"}
                        />
                      </div>

                      {session.emergencyDelayMinutes > 0 ? (
                        <p className="text-sm text-amber-600 dark:text-amber-500">
                          The doctor is running about {session.emergencyDelayMinutes} min behind.
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2">
                        {canBookOnline ? (
                          <>
                            <Button render={<Link href={`/c/${slug}`} />} nativeButton={false}>
                              Join queue from home · ₹{feeRupees}
                              <ArrowRightIcon className="size-4" />
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              {onlineLeft} online {onlineLeft === 1 ? "slot" : "slots"} left
                            </span>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {!isOpen
                              ? "Booking opens when the clinic starts this session."
                              : !onlineEnabled
                                ? "Scan the QR code at the clinic to take a free token."
                                : "Online slots are gone — a free token is still available at the clinic."}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Walk-in tokens are always free. The fee covers reserving a slot remotely.
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="text-center">
      <p className="flex items-center justify-center gap-1 font-mono text-lg font-semibold tabular-nums">
        {icon ? <UsersIcon className="size-3.5" /> : null}
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
