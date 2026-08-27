import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no l/i/1/o/0 — QR fallback is typed by hand

/**
 * Unguessable public handle for a session. Rejection-sampled so every character is
 * uniformly distributed; `randomBytes(n) % 31` would bias the early letters.
 */
export function generateQrToken(length = 16): string {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= 248) continue; // 248 = 31 * 8, the largest unbiased multiple
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}
