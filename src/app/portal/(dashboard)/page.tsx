import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDaysIcon, ChevronRightIcon, UsersIcon } from "lucide-react";

import { CreateSessionDialog } from "@/components/portal/create-session-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getPortalClinicId } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { SessionModel } from "@/models";

// The queue changes constantly; a cached shell would show a stale token count.
export const dynamic = "force-dynamic";

const STATUS_VARIANT = {
  active: "default",
  scheduled: "secondary",
  paused: "outline",
  closed: "outline",
} as const;

export default async function PortalHomePage() {
  const clinicId = await getPortalClinicId();
  if (!clinicId) redirect("/portal/login");

  await connectToDatabase();
  const sessions = await SessionModel.find({ clinicId }).sort({ sessionDate: -1 }).limit(30).lean();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            Open a session, then print its QR code for the reception desk.
          </p>
        </div>
        <div className="ml-auto">
          <CreateSessionDialog />
        </div>
      </div>

      {sessions.length === 0 ? (
        <Card className="border-dashed border-border/60">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <CalendarDaysIcon className="size-8 text-muted-foreground" />
            <p className="font-medium">No sessions yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create today&apos;s session to generate a QR code and start issuing tokens.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <li key={String(session._id)}>
              <Link href={`/portal/session/${String(session._id)}`} className="group block">
                <Card className="h-full border-border/60 bg-card/70 backdrop-blur-xl transition-colors hover:border-primary/40">
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-2">
                      <div>
                        <p className="font-medium">
                          {session.sessionDate.toISOString().slice(0, 10)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {session.startTime} – {session.endTime}
                        </p>
                      </div>
                      <Badge
                        variant={STATUS_VARIANT[session.status as keyof typeof STATUS_VARIANT]}
                        className="ml-auto"
                      >
                        {session.status}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <UsersIcon className="size-3.5" />
                        {session.counters?.issued ?? 0}/{session.maxPatients}
                      </span>
                      <span className="font-mono tabular-nums">
                        now #{session.currentTokenNumber || "—"}
                      </span>
                      <ChevronRightIcon className="ml-auto size-4 transition-colors group-hover:text-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
