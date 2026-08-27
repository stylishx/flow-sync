import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, PrinterIcon } from "lucide-react";

import { LiveRefresh } from "@/components/portal/live-refresh";
import { QueueControl, type QueueRow } from "@/components/portal/queue-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPortalClinicId } from "@/lib/auth";
import { renderSessionQrSvg, sessionUrl } from "@/lib/qr";
import { getQueueSnapshot } from "@/lib/queue";
import type { Token } from "@/models";

export const dynamic = "force-dynamic";

type LeanToken = Token & { _id: unknown };

function toRow(token: LeanToken): QueueRow {
  return {
    id: String(token._id),
    tokenNumber: token.tokenNumber,
    name: token.patient?.name ?? "Unknown",
    age: token.patient?.age ?? 0,
    source: token.source as "walkin" | "online",
    status: token.status,
  };
}

export default async function SessionPage({ params }: PageProps<"/portal/session/[sessionId]">) {
  const clinicId = await getPortalClinicId();
  if (!clinicId) redirect("/portal/login");

  const { sessionId } = await params;
  const snapshot = await getQueueSnapshot(sessionId, clinicId);
  if (!snapshot) notFound();

  const { session, serving, waiting, recent, waitingCount } = snapshot;
  const qrSvg = await renderSessionQrSvg(session.qrToken);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          render={<Link href="/portal" />}
          nativeButton={false}
          variant="ghost"
          size="icon"
          aria-label="Back to sessions"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>

        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {session.sessionDate.toISOString().slice(0, 10)}
            <Badge variant={session.status === "active" ? "default" : "secondary"}>
              {session.status}
            </Badge>
            <LiveRefresh
              qrToken={session.qrToken}
              initial={{
                status: session.status,
                currentTokenNumber: session.currentTokenNumber,
                emergencyDelayMinutes: session.emergencyDelayMinutes,
                waitingCount,
              }}
            />
          </h1>
          <p className="text-sm text-muted-foreground">
            {session.startTime} – {session.endTime} · {session.counters?.issued ?? 0}/
            {session.maxPatients} issued · {session.estimatedConsultMinutes} min each
          </p>
        </div>

        <Button
          render={
            <Link
              href={`/portal/session/${sessionId}nativeButton={false}
          /print`}
            />
          }
          variant="outline"
          className="ml-auto"
        >
          <PrinterIcon className="size-4" />
          Print QR
        </Button>
      </div>

      <QueueControl
        sessionId={sessionId}
        status={session.status as "scheduled" | "active" | "paused" | "closed"}
        currentTokenNumber={session.currentTokenNumber}
        servingName={serving?.patient?.name}
        waiting={(waiting as LeanToken[]).map(toRow)}
        recent={(recent as LeanToken[]).map(toRow)}
        waitingCount={waitingCount}
        consultMinutes={session.estimatedConsultMinutes}
        emergencyDelayMinutes={session.emergencyDelayMinutes}
      />

      <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
        <CardContent className="flex flex-wrap items-center gap-4">
          <div
            className="size-24 shrink-0 overflow-hidden rounded-lg bg-white p-1.5 [&>svg]:size-full"
            // Trusted input: the SVG is generated server-side by the qrcode library
            // from our own session URL, never from anything a user supplied.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">Session QR</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {sessionUrl(session.qrToken)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Patients scanning this take a token for this session only.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
