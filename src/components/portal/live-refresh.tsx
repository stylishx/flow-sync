"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { RadioIcon, WifiOffIcon } from "lucide-react";

import { useQueueStream, type QueueState } from "@/hooks/use-queue-stream";
import { cn } from "@/lib/utils";

interface LiveRefreshProps {
  qrToken: string;
  initial: QueueState;
}

/**
 * Keeps a second staff device in sync.
 *
 * Server Actions call `revalidatePath`, which only refreshes the device that acted —
 * a compounder watching the same session on a tablet would go stale. This subscribes
 * to the same stream the patients use and calls `router.refresh()` when the queue
 * actually moves, so both screens agree.
 *
 * The first payload is skipped: it merely echoes what the server already rendered,
 * and refreshing on it would mean an extra round trip on every page load.
 */
export function LiveRefresh({ qrToken, initial }: LiveRefreshProps) {
  const router = useRouter();
  const { state, connection } = useQueueStream(qrToken, initial);
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
    const signature = [
      state.status,
      state.currentTokenNumber,
      state.emergencyDelayMinutes,
      state.waitingCount,
    ].join("|");

    if (lastSeen.current === null) {
      lastSeen.current = signature;
      return;
    }
    if (lastSeen.current === signature) return;

    lastSeen.current = signature;
    router.refresh();
  }, [state, router]);

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {connection === "offline" ? (
        <>
          <WifiOffIcon className="size-3" />
          Offline
        </>
      ) : (
        <>
          <RadioIcon
            className={cn("size-3", connection === "live" && "animate-pulse text-primary")}
          />
          {connection === "live" ? "Live" : connection === "polling" ? "Polling" : "Connecting"}
        </>
      )}
    </span>
  );
}
