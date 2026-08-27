/**
 * Mobile-number normalisation. Client and server both use this, so it must stay free
 * of `server-only` imports — the booking form shows the normalised value back to the
 * patient before they submit.
 */

/**
 * Normalises Indian mobile numbers to E.164. Accepts `98765 43210`, `098765-43210`,
 * `+91 98765 43210`, `91 9876543210`. Returns null if it is not a plausible Indian
 * mobile — Indian mobiles are 10 digits starting 6-9.
 *
 * Deliberately India-only: `Clinic.timezone` defaults to Asia/Kolkata and the whole
 * product targets Indian clinics. Widening this needs a real libphonenumber, not more
 * regexes.
 */
export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  const local =
    digits.startsWith("91") && digits.length === 12
      ? digits.slice(2)
      : digits.startsWith("0") && digits.length === 11
        ? digits.slice(1)
        : digits;

  if (local.length !== 10) return null;
  if (!/^[6-9]/.test(local)) return null;
  return `+91${local}`;
}

/** `+919876543210` → `98765 43210`, for display. */
export function formatMobile(e164: string): string {
  const local = e164.replace(/^\+91/, "");
  return local.length === 10 ? `${local.slice(0, 5)} ${local.slice(5)}` : e164;
}

/** `+919876543210` → `•••••43210`, for a screen a stranger might glance at. */
export function maskMobile(e164: string): string {
  const local = e164.replace(/^\+91/, "");
  return local.length === 10 ? `•••••${local.slice(5)}` : "•••••";
}
