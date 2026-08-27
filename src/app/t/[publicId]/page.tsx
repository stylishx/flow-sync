import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TokenStatus } from "@/components/patient/token-status";
import { connectToDatabase } from "@/lib/db";
import { getPatientView } from "@/lib/issue";
import { maskMobile } from "@/lib/mobile";
import { ClinicModel, TokenModel } from "@/models";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your token — Flow-Sync",
  robots: { index: false, follow: false },
};

export default async function TokenPage({ params }: PageProps<"/t/[publicId]">) {
  const { publicId } = await params;

  const view = await getPatientView(publicId);
  if (!view) notFound();

  const { token, session } = view;

  await connectToDatabase();
  const [clinic, waitingCount] = await Promise.all([
    ClinicModel.findById(token.clinicId).lean(),
    TokenModel.countDocuments({ sessionId: token.sessionId, status: "waiting" }),
  ]);
  if (!clinic) notFound();

  return (
    <main className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-background via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <header className="space-y-0.5 text-center">
          <h1 className="text-lg font-semibold tracking-tight">{clinic.name}</h1>
          <p className="text-sm text-muted-foreground">{clinic.doctorName}</p>
        </header>

        <TokenStatus
          qrToken={session.qrToken}
          tokenNumber={token.tokenNumber}
          patientName={token.patient?.name ?? "Patient"}
          tokenStatus={token.status}
          consultMinutes={session.estimatedConsultMinutes}
          initial={{
            status: session.status,
            currentTokenNumber: session.currentTokenNumber,
            emergencyDelayMinutes: session.emergencyDelayMinutes,
            waitingCount,
          }}
        />

        <div className="space-y-1 text-center text-xs text-muted-foreground">
          <p>Alerts go to {maskMobile(token.patient?.mobile ?? "")} when you are nearly up.</p>
          <p>Bookmark this page — it updates on its own. No need to refresh.</p>
        </div>
      </div>
    </main>
  );
}
