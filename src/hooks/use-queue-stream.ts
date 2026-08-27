"use client";

import { useEffect, useRef, useState } from "react";

export interface QueueState {
  status: string;
  currentTokenNumber: number;
  emergencyDelayMinutes: number;
  waitingCount: number;
  /** Server send-time. Present on wire frames, absent on the server-rendered seed. */
  updatedAt?: number;
}

export type ConnectionState = "connecting" | "live" | "polling" | "offline";

const POLL_INTERVAL_MS = 8_000;
const FAILURES_BEFORE_FALLBACK = 3;

/**
 * Subscribes to a session's queue state.
 *
 * EventSource reconnects on its own after the server closes each ~50s window, so a
 * normal cycle looks like repeated opens and is not an error. What this adds is a
 * fallback: if the stream fails repeatedly — a corporate proxy that buffers SSE, a
 * flaky mobile connection — it gives up and polls a plain JSON endpoint instead. A
 * patient watching for their number must never be left on a frozen screen.
 */
export function useQueueStream(qrToken: string, initial: QueueState) {
  const [state, setState] = useState<QueueState>(initial);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const failuresRef = useRef(0);

  useEffect(() => {
    if (!qrToken) return;

    let disposed = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/session/${qrToken}/state`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as QueueState;
        if (!disposed) {
          setState(next);
          setConnection("polling");
        }
      } catch {
        if (!disposed) setConnection("offline");
      }
    };

    const startPolling = () => {
      if (pollTimer || disposed) return;
      source?.close();
      source = null;
      void poll();
      pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    };

    const connect = () => {
      if (disposed) return;
      source = new EventSource(`/api/session/${qrToken}/stream`);

      source.addEventListener("open", () => {
        if (disposed) return;
        failuresRef.current = 0;
        setConnection("live");
      });

      source.addEventListener("queue", (event) => {
        if (disposed) return;
        try {
          setState(JSON.parse((event as MessageEvent<string>).data) as QueueState);
          setConnection("live");
        } catch {
          /* malformed frame; the next one will be fine */
        }
      });

      source.addEventListener("error", () => {
        if (disposed) return;
        // EventSource retries by itself; only bail out after it keeps failing.
        failuresRef.current += 1;
        if (failuresRef.current >= FAILURES_BEFORE_FALLBACK) startPolling();
        else setConnection("connecting");
      });
    };

    connect();

    return () => {
      disposed = true;
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [qrToken]);

  return { state, connection };
}
