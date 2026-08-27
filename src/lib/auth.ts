import "server-only";

import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { cookies } from "next/headers";

import { env } from "@/lib/env";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const COOKIE_NAME = "flowsync_portal";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // one clinic day

/* ------------------------------- passcode -------------------------------- */

export async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(passcode, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPasscode(passcode: string, stored: string): Promise<boolean> {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const derived = await scryptAsync(passcode, salt, 64);
  const expectedBuf = Buffer.from(expected, "hex");
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (expectedBuf.length !== derived.length) return false;
  return timingSafeEqual(derived, expectedBuf);
}

/* -------------------------------- cookie --------------------------------- */

function sign(payload: string): string {
  return createHmac("sha256", env.PORTAL_SESSION_SECRET).update(payload).digest("hex");
}

/**
 * Stateless signed cookie: `<clinicId>.<expiresAt>.<hmac>`. No server-side session
 * store, which keeps this working on serverless. The trade-off is that a cookie
 * cannot be revoked before it expires — acceptable for a 12-hour staff shift, but
 * it is why the TTL is short.
 */
export async function createPortalSession(clinicId: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${clinicId}.${expiresAt}`;
  const store = await cookies();
  store.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function destroyPortalSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Returns the authenticated clinic id, or null. Never throws. */
export async function getPortalClinicId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const [clinicId, expiresAt, signature] = raw.split(".");
  if (!clinicId || !expiresAt || !signature) return null;

  const expected = sign(`${clinicId}.${expiresAt}`);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  if (Number(expiresAt) < Date.now()) return null;
  return clinicId;
}
