import "server-only";

import QRCode from "qrcode";

import { env } from "@/lib/env";

/** The URL a printed session QR code resolves to. */
export function sessionUrl(qrToken: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/s/${qrToken}`;
}

/**
 * Returns the QR as an SVG string rather than a PNG data URI: SVG is resolution
 * independent, so the same markup is crisp on a phone screen and on an A4 poster
 * taped to the reception desk. `errorCorrectionLevel: "H"` tolerates ~30% damage,
 * which matters for a code that will be printed once and then scuffed for months.
 */
export async function renderSessionQrSvg(qrToken: string): Promise<string> {
  return QRCode.toString(sessionUrl(qrToken), {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
