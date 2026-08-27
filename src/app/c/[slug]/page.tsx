import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClockIcon, StethoscopeIcon, UsersIcon } from "lucide-react";

import { OnlineBookingForm } from "@/components/patient/online-booking-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { connectToDatabase } from "@/lib/db";
import { env } from "@/lib/env";
import { ClinicModel, SessionModel, TokenModel } from "@/models";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  await connectToDatabase();
  const clinic = await ClinicModel.findOne({ slug }).lean();
  return {
    title: clinic ? `Book online — ${clinic.name}` : "Book online — Flow-Sync",
  };
}

export default async function OnlineBookingPage({ params }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  await connectToDatabase();

  const clinic = await ClinicModel.findOne({ slug, isActive: true }).lean();
  if (!clinic) notFound();

  // Only an active session can be booked into remotely — a scheduled one has no
  // meaningful queue position to sell yet.
  const session = await SessionModel.findOne({ clinicId: clinic._id, status: "active" })
    .sort({ sessionDate: -1 })
    .lean();

  const waitingCount = session
    ? await TokenModel.countDocuments({ sessionId: session._id, status: "waiting" })
    : 0;

  const onlineIssued = session?.counters?.online ?? 0;
  const onlineQuota = session?.onlineQuota ?? 0;
  const onlineLeft = Math.max(0, onlineQuota - onlineIssued);
  const bookingOpen = Boolean(session) && clinic.onlineBooking?.enabled && onlineLeft > 0;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-background via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-1 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <StethoscopeIcon className="size-6" />
          </span>
          <h1 className="pt-2 text-2xl font-semibold tracking-tight">{clinic.name}</h1>
          <p className="text-muted-foreground">{clinic.doctorName}</p>
        </header>

        {session ? (
          <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
            <CardContent className="flex items-center justify-around gap-4 text-center">
              <div>
                <p className="font-mono text-2xl font-bold tabular-nums">
                  {session.currentTokenNumber || "—"}
                </p>
                <p className="text-xs text-muted-foreground">Now serving</p>
              </div>
              <div>
                <p className="flex items-center justify-center gap-1 font-mono text-2xl font-bold tabular-nums">
                  <UsersIcon className="size-4" />
                  {waitingCount}
                </p>
                <p className="text-xs text-muted-foreground">Waiting</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-bold tabular-nums">{onlineLeft}</p>
                <p className="text-xs text-muted-foreground">Slots left</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
          <CardContent>
            {bookingOpen && session ? (
              <OnlineBookingForm
                qrToken={session.qrToken}
                feeInPaise={clinic.onlineBooking?.feeInPaise ?? 0}
                isStubPayment={env.PAYMENT_PROVIDER === "stub"}
              />
            ) : (
              <div className="space-y-2 py-8 text-center">
                <CalendarClockIcon className="mx-auto size-8 text-muted-foreground" />
                <Badge variant="secondary">
                  {!session ? "No active session" : onlineLeft === 0 ? "Sold out" : "Unavailable"}
                </Badge>
                <p className="font-medium">
                  {!session
                    ? "The clinic is not open right now."
                    : onlineLeft === 0
                      ? "Online slots for today are gone."
                      : "Online booking is switched off."}
                </p>
                <p className="text-sm text-muted-foreground">
                  You can still scan the QR code at the clinic to take a free token.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {session ? (
          <p className="text-center text-xs text-muted-foreground">
            {session.startTime} – {session.endTime} · about {session.estimatedConsultMinutes} min
            per patient
          </p>
        ) : null}
      </div>
    </main>
  );
}
