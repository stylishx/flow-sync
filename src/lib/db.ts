import "server-only";

import mongoose, { type Mongoose } from "mongoose";

import { env } from "@/lib/env";

/**
 * Serverless-safe Mongoose connection.
 *
 * Every warm Vercel invocation reuses the same Node process, so a naive
 * `mongoose.connect()` per request would open a new pool each time and exhaust
 * the Atlas connection limit. The connection *and* the in-flight promise are
 * cached on `globalThis` — caching the promise matters because concurrent cold
 * requests would otherwise each start their own handshake.
 */
interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

const globalWithMongoose = globalThis as typeof globalThis & {
  __flowSyncMongoose?: MongooseCache;
};

const cache: MongooseCache = (globalWithMongoose.__flowSyncMongoose ??= {
  conn: null,
  promise: null,
});

export async function connectToDatabase(): Promise<Mongoose> {
  if (cache.conn) return cache.conn;

  cache.promise ??= mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    // Fail fast rather than letting the driver queue operations forever behind a
    // dead connection — a hung serverless function is worse than a clear error.
    bufferCommands: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
    // Index builds must not run on every cold start in production. `npm run seed`
    // and `npm run db:indexes` call syncIndexes() explicitly instead.
    autoIndex: env.NODE_ENV !== "production",
  });

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    // Clear the failed promise so the next request retries instead of awaiting a
    // permanently rejected one.
    cache.promise = null;

    // The full driver error goes to the server log, where it is useful.
    console.error("[db] connection failed:", error);

    // What propagates is a plain Error. A MongooseServerSelectionError carries a
    // `reason: TopologyDescription` class instance, and React cannot serialise that
    // across the Server/Client boundary — the result is a second, confusing
    // "Only plain objects can be passed to Client Components" error that buries the
    // real one. It would also leak the cluster hostnames to the browser.
    throw new DatabaseUnavailableError();
  }

  return cache.conn;
}

/** Thrown instead of the driver's error. Safe to serialise, safe to show. */
export class DatabaseUnavailableError extends Error {
  constructor() {
    super("The database is unavailable.");
    this.name = "DatabaseUnavailableError";
  }
}

export function isDatabaseUnavailable(error: unknown): boolean {
  return error instanceof DatabaseUnavailableError;
}

export async function disconnectFromDatabase(): Promise<void> {
  if (!cache.conn) return;
  await mongoose.disconnect();
  cache.conn = null;
  cache.promise = null;
}
