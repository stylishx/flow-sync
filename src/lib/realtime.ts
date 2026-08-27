import "server-only";

/**
 * Realtime transport.
 *
 * WebSockets are not an option: Vercel's serverless functions cannot hold a
 * long-lived socket. SSE can, but only for the function's maximum duration, so this
 * deliberately closes each stream after STREAM_TTL_MS and lets the browser's
 * EventSource reconnect on its own — that reconnect is built into the standard and
 * costs nothing to use.
 *
 * There is no pub/sub here either, for the same reason: instances do not share
 * memory, so a broadcast from the instance handling "Call Next" would never reach the
 * instance holding a patient's stream. Instead each stream polls its own session
 * document and pushes only when something the client cares about actually changed.
 * At clinic scale (tens of concurrent viewers per session) that is a handful of
 * indexed point-reads per second.
 *
 * Swapping to Ably/Pusher/Upstash later means reimplementing `streamSessionState`
 * and nothing else — every consumer goes through this module.
 */

const STREAM_TTL_MS = 50_000; // under Vercel's default function timeout
const POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_MS = 15_000;

export interface SessionState {
  status: string;
  currentTokenNumber: number;
  emergencyDelayMinutes: number;
  waitingCount: number;
  updatedAt: number;
}

export type SessionStateReader = () => Promise<SessionState | null>;

function encodeEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Fields a client re-renders on. Anything else changing must not wake every phone. */
function fingerprintState(state: SessionState): string {
  return [
    state.status,
    state.currentTokenNumber,
    state.emergencyDelayMinutes,
    state.waitingCount,
  ].join("|");
}

/**
 * Builds the SSE body. `read` is injected so this module never imports the models
 * directly and stays testable without a database.
 */
export function streamSessionState(read: SessionStateReader): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event, data)));
        } catch {
          closed = true;
        }
      };

      const startedAt = Date.now();
      let lastFingerprint = "";
      let lastHeartbeat = Date.now();

      // Tell the browser how long to wait before reconnecting after we close.
      if (!closed) controller.enqueue(encoder.encode("retry: 3000\n\n"));

      while (!closed && Date.now() - startedAt < STREAM_TTL_MS) {
        let state: SessionState | null = null;
        try {
          state = await read();
        } catch {
          send("error", { message: "read_failed" });
        }

        if (state) {
          const next = fingerprintState(state);
          if (next !== lastFingerprint) {
            lastFingerprint = next;
            send("queue", state);
          }
        } else {
          send("gone", {});
          break;
        }

        // Keeps proxies from closing an idle connection.
        if (Date.now() - lastHeartbeat > HEARTBEAT_MS) {
          lastHeartbeat = Date.now();
          if (!closed) {
            try {
              controller.enqueue(encoder.encode(": ping\n\n"));
            } catch {
              closed = true;
            }
          }
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      // A clean close, so EventSource reconnects rather than reporting an error.
      send("bye", { reason: "ttl" });
      if (!closed) {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by the client disconnecting */
        }
      }
    },

    cancel() {
      // The patient closed the tab or walked out of range.
      closed = true;
    },
  });
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Disables proxy buffering, which otherwise holds events until the stream ends.
  "X-Accel-Buffering": "no",
} as const;
