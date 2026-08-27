import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PrintButton } from "@/components/portal/print-button";
import { getPortalClinicId } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { renderSessionQrSvg, sessionUrl } from "@/lib/qr";
import { ClinicModel, SessionModel } from "@/models";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Session QR poster",
  robots: { index: false, follow: false },
};

/**
 * A4 poster for the reception desk.
 *
 * Deliberately lives OUTSIDE the (dashboard) route group: a print page must not
 * inherit the portal's sticky header and `max-w-6xl` content wrapper, which squeezed
 * and padded the printed sheet. Auth is enforced here directly instead.
 *
 * The QR is an inline SVG sized in millimetres by `.print-qr`, so it prints at the
 * printer's native resolution at a physical size that scans from across a room.
 */
export default async function PrintQrPage({ params }: PageProps<"/portal/print/[sessionId]">) {
  const clinicId = await getPortalClinicId();
  if (!clinicId) redirect("/portal/login");

  const { sessionId } = await params;
  await connectToDatabase();

  const session = await SessionModel.findOne({ _id: sessionId, clinicId }).lean();
  if (!session) notFound();
  const clinic = await ClinicModel.findById(clinicId).lean();
  if (!clinic) notFound();

  const qrSvg = await renderSessionQrSvg(session.qrToken);
  const url = sessionUrl(session.qrToken);

  return (
    <div className="print-sheet mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-8 bg-white p-10 text-center text-black">
      <PrintButton />

      <header className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight">{clinic.name}</h1>
        <p className="text-xl text-neutral-600">{clinic.doctorName}</p>
        {clinic.specialization ? (
          <p className="text-lg text-neutral-500">{clinic.specialization}</p>
        ) : null}
      </header>

      <div className="print-exact print-break-avoid rounded-3xl border-4 border-black bg-white p-6">
        <div
          className="print-qr size-80 [&>svg]:size-full"
          // Trusted: generated server-side by the qrcode library from our own URL.
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
      </div>

      <section className="print-break-avoid space-y-3">
        <p className="text-3xl font-semibold">Scan to join the queue</p>
        <p className="text-lg text-neutral-700">
          No app, no login. Point your phone camera at the code.
        </p>
        <p className="font-mono text-sm text-neutral-500">{url}</p>
      </section>

      <footer className="text-lg text-neutral-600">
        {session.sessionDate.toISOString().slice(0, 10)} · {session.startTime} – {session.endTime} ·
        about {session.estimatedConsultMinutes} min per patient
      </footer>
    </div>
  );
}
