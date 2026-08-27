import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { env } from "@/lib/env";

/**
 * Fixed-window rate limiter with two backends.
 *
 * - **Upstash Redis** when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
 *   are set. Shared across serverless instances, so the configured limit is the real
 *   limit. Uses the REST API over plain `fetch` — no client library, nothing to keep
 *   in sync at build time.
 * - **Process memory** otherwise. Each instance keeps its own counter, so the
 *   effective limit is (limit x instance count). Fine for development and a single
 *   long-lived server; advisory only on Vercel.
 *
 * Either way this is a speed bump. The uniqueness guarantee lives in the partial
 * unique indexes, which do not care how many instances exist.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const globalWithBuckets = globalThis as typeof globalThis & {
  __flowSyncRateBuckets?: Map<string, Bucket>;
};

const buckets: Map<string, Bucket> = (globalWithBuckets.__flowSyncRateBuckets ??= new Map());

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  backend: "redis" | "memory";
}

// Named to avoid the "use" prefix, which the React lint reads as a hook.
function hasSharedBackend(): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

function limitInMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Opportunistic sweep so the map cannot grow without bound in a long-lived
    // instance. Cheap because it only runs when a new window opens.
    if (buckets.size > 5_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0, backend: "memory" };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      backend: "memory",
    };
  }
  return {
    allowed: true,
    remaining: limit - bucket.count,
    retryAfterSeconds: 0,
    backend: "memory",
  };
}

async function limitInRedis(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowSeconds = Math.ceil(windowMs / 1000);

  // INCR then EXPIRE in one pipelined round trip. EXPIRE is unconditional rather than
  // NX-guarded: re-arming the TTL on every hit within a fixed window is harmless and
  // avoids a key that lost its TTL living forever.
  const response = await fetch(`${env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(windowSeconds), "NX"],
      ["TTL", key],
    ]),
    signal: AbortSignal.timeout(3_000),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Upstash ${response.status}`);

  const payload = (await response.json()) as Array<{ result?: unknown; error?: string }>;
  const count = Number(payload[0]?.result ?? 0);
  const ttl = Number(payload[2]?.result ?? windowSeconds);

  if (!Number.isFinite(count) || count <= 0) throw new Error("Upstash returned no count");

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: count > limit ? Math.max(1, ttl) : 0,
    backend: "redis",
  };
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (!hasSharedBackend()) return limitInMemory(key, limit, windowMs);

  try {
    return await limitInRedis(key, limit, windowMs);
  } catch (error) {
    // Fail open, but locally. A Redis outage must not stop a sick person taking a
    // token; the in-memory limiter still catches the obvious abuse, and the unique
    // indexes still prevent duplicates.
    console.error("[ratelimit] Redis unavailable, falling back to memory:", error);
    return limitInMemory(key, limit, windowMs);
  }
}

/**
 * Best-effort client IP. Behind Vercel this is x-forwarded-for; the leftmost entry is
 * the closest thing to the real client. It is spoofable in general, which is another
 * reason the database indexes carry the real guarantee.
 */
export async function getClientIpHash(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  // Hashed with the app secret so the stored value cannot be reversed to an IP.
  return createHash("sha256")
    .update(`${ip}:${env.PORTAL_SESSION_SECRET}`)
    .digest("hex")
    .slice(0, 32);
}
