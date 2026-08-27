"use client";

/**
 * Per-device identifier for the one-token-per-person rule.
 *
 * This is a random id kept in localStorage, NOT a browser fingerprint. Real
 * fingerprinting (canvas, fonts, WebGL) is privacy-invasive, unreliable across
 * browser updates, and actively blocked on iOS — poor grounds for refusing a sick
 * person a queue token.
 *
 * The honest trade-off: clearing site data or opening a private window yields a new
 * id. That is why mobile number is the second uniqueness key, and why staff can issue
 * a token manually. This stops accidental and casual double-booking, which is what
 * actually happens at a clinic desk.
 */
const STORAGE_KEY = "flowsync.device";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const fresh = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Private mode, or storage disabled entirely. Fall back to a per-tab id so the
    // booking still works — the database indexes and mobile number still apply.
    return `ephemeral-${crypto.randomUUID()}`;
  }
}
