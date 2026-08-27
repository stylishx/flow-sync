import { renderSessionQrSvg, sessionUrl } from "@/lib/qr";
import { formatMobile } from "@/lib/mobile";

interface TokenSlipProps {
  clinicName: string;
  doctorName: string;
  tokenNumber: number;
  patientName: string;
  patientMobile: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  qrToken: string;
  statusUrl: string;
}

/**
 * The paper slip a receptionist hands over.
 *
 * Hidden on screen and revealed only for print (`hidden print:block`), so the patient
 * page stays a live status screen while still producing something printable. The QR
 * points at the session, not the patient's private status URL — a slip left on a chair
 * should not expose someone's name and number.
 */
export async function TokenSlip(props: TokenSlipProps) {
  const qrSvg = await renderSessionQrSvg(props.qrToken);

  return (
    <div className="print-sheet print-break-avoid hidden bg-white p-0 text-black print:block">
      <div className="mx-auto max-w-md border-2 border-dashed border-black p-6 text-center">
        <p className="text-xl font-bold">{props.clinicName}</p>
        <p className="text-sm text-neutral-600">{props.doctorName}</p>

        <div className="my-4 border-y-2 border-black py-4">
          <p className="text-xs tracking-widest text-neutral-600 uppercase">Your token</p>
          <p className="font-mono text-6xl leading-none font-bold">{props.tokenNumber}</p>
        </div>

        <div className="space-y-0.5 text-sm">
          <p className="font-semibold">{props.patientName}</p>
          <p className="text-neutral-600">{formatMobile(props.patientMobile)}</p>
        </div>

        <div className="print-exact mx-auto my-4 w-fit bg-white p-1">
          <div
            className="print-qr-small size-28 [&>svg]:size-full"
            // Trusted: generated server-side by the qrcode library from our own URL.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        </div>

        <p className="text-xs text-neutral-600">
          Scan to check the live queue, or open
          <br />
          <span className="font-mono">{sessionUrl(props.qrToken)}</span>
        </p>

        <p className="mt-3 border-t border-neutral-300 pt-2 text-xs text-neutral-500">
          {props.sessionDate} · {props.startTime} – {props.endTime}
        </p>
      </div>
    </div>
  );
}
