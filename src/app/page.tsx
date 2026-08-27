import type { Metadata } from "next";
import Link from "next/link";
import { QrCodeIcon, StethoscopeIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Flow-Sync — Clinic queue",
  description: "Scan a clinic QR code to take a live token. No app, no login.",
};

/**
 * Patients arrive via a QR code, never here, so this exists mainly to give the domain
 * root something honest: what the product is, and a way into the staff portal.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-background via-background to-primary/5 px-6 py-16">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-3">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <StethoscopeIcon className="size-7" />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">Flow-Sync</h1>
          <p className="text-muted-foreground">
            Live token queues for clinics. Patients scan, take a number, and watch the queue move —
            no app, no login, no waiting room guesswork.
          </p>
        </div>

        <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <QrCodeIcon className="size-7 text-muted-foreground" />
            <div>
              <p className="font-medium">Here as a patient?</p>
              <p className="text-sm text-muted-foreground">
                Scan the QR code at the clinic&apos;s reception desk. There is nothing to install.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            render={<Link href="/portal/login" />}
            nativeButton={false}
            variant="outline"
            size="lg"
          >
            Staff sign in
          </Button>
          <Button render={<Link href="/portal/register" />} nativeButton={false} size="lg">
            Register a clinic
          </Button>
        </div>
      </div>
    </main>
  );
}
