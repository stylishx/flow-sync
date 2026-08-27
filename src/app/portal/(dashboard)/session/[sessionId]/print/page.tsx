import { notFound, redirect } from "next/navigation";

import { PrintButton } from "@/components/portal/print-button";
import { getPortalClinicId } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { renderSessionQrSvg, sessionUrl } from "@/lib/qr";
import { ClinicModel, SessionModel } from "@/models";

export const dynamic = "force-dynamic";

/**
 * A4 poster for the reception desk. The QR is an inline SVG, so it prints at the
 * printer's native resolution rather than at a bitmap's — a scanned-from-across-
 * the-room code needs the crisp edges.
 */
export default async function PrintQrPage({
  params,
}: PageProps<"/portal/session/[sessionId]/print">) {
  const clinicId = await getPortalClinicId();
  if (!clinicId) redirect("/portal/login");

  const { sessionId } = await params;
  await connectToDatabase();

  const session = await SessionModel.findOne({ _id: sessionId, clinicId }).lean();
  if (!session) notFound();
  const clinic = await ClinicModel.findById(clinicId).lean();
  if (!clinic) notFound();

  const qrSvg = await renderSessionQrSvg(session.qrToken);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-8 bg-white p-10 text-center text-black print:min-h-0">
      <PrintButton />

      <header className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight">{clinic.name}</h1>
        <p className="text-xl text-neutral-600">{clinic.doctorName}</p>
      </header>

      <div className="rounded-3xl border-4 border-black p-6">
        <div className="size-80 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      </div>

      <section className="space-y-3">
        <p className="text-3xl font-semibold">Scan to join the queue</p>
        <p className="text-lg text-neutral-700">
          No app, no login. Point your phone camera at the code.
        </p>
        <p className="font-mono text-sm text-neutral-500">{sessionUrl(session.qrToken)}</p>
      </section>

      <footer className="text-lg text-neutral-600">
        {session.sessionDate.toISOString().slice(0, 10)} · {session.startTime} – {session.endTime}
      </footer>
    </div>
  );
}
