import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClockIcon, StethoscopeIcon, UsersIcon } from "lucide-react";

import { BookingForm } from "@/components/patient/booking-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { connectToDatabase } from "@/lib/db";
import { ClinicModel, SessionModel, TokenModel } from "@/models";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Take a token — Flow-Sync",
  robots: { index: false, follow: false },
};

export default async function BookingPage({ params }: PageProps<"/s/[qrToken]">) {
  const { qrToken } = await params;
  await connectToDatabase();

  const session = await SessionModel.findOne({ qrToken }).lean();
  if (!session) notFound();

  const clinic = await ClinicModel.findById(session.clinicId).lean();
  if (!clinic) notFound();

  const waitingCount = await TokenModel.countDocuments({
    sessionId: session._id,
    status: "waiting",
  });

  const isOpen = session.status === "active";
  const isFull = (session.lastIssuedNumber ?? 0) >= session.maxPatients;
  const estimatedWait =
    waitingCount * session.estimatedConsultMinutes + session.emergencyDelayMinutes;

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
              <p className="flex items-center justify-center gap-1 font-mono text-2xl font-bold tabular-nums">
                <ClockIcon className="size-4" />
                {estimatedWait}
              </p>
              <p className="text-xs text-muted-foreground">Min wait</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
          <CardContent>
            {isOpen && !isFull ? (
              <BookingForm qrToken={qrToken} />
            ) : (
              <div className="space-y-2 py-6 text-center">
                <Badge variant="secondary">{isFull ? "Full" : session.status}</Badge>
                <p className="font-medium">
                  {isFull
                    ? "Today's queue is full."
                    : session.status === "closed"
                      ? "This session has closed."
                      : "The queue is not open yet."}
                </p>
                <p className="text-sm text-muted-foreground">Please ask at the reception desk.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          {session.startTime} – {session.endTime} · about {session.estimatedConsultMinutes} min per
          patient
        </p>
      </div>
    </main>
  );
}
