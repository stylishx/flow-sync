"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  BellRingIcon,
  CheckCircle2Icon,
  PauseCircleIcon,
  RadioIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useQueueStream, type QueueState } from "@/hooks/use-queue-stream";
import { formatWait } from "@/lib/wait";
import { cn } from "@/lib/utils";

interface TokenStatusProps {
  qrToken: string;
  tokenNumber: number;
  patientName: string;
  tokenStatus: string;
  consultMinutes: number;
  /** Counted server-side from queueOrder. Cannot be derived from token numbers. */
  peopleAhead: number;
  initial: QueueState;
}

export function TokenStatus({
  qrToken,
  tokenNumber,
  patientName,
  tokenStatus,
  consultMinutes,
  peopleAhead,
  initial,
}: TokenStatusProps) {
  const router = useRouter();
  const { state, connection } = useQueueStream(qrToken, initial);
  const lastSeen = useRef<string | null>(null);

  // `peopleAhead` is rendered on the server, so the page has to be re-fetched when the
  // queue actually moves. The first payload only echoes what was already rendered, so
  // it is skipped to avoid a needless round trip on every page load.
  useEffect(() => {
    const signature = `${state.status}|${state.currentTokenNumber}|${state.waitingCount}`;
    if (lastSeen.current === null) {
      lastSeen.current = signature;
      return;
    }
    if (lastSeen.current === signature) return;
    lastSeen.current = signature;
    router.refresh();
  }, [state, router]);

  // `peopleAhead` is counted server-side from queueOrder. It deliberately is NOT
  // derived from token numbers any more: once a held patient is slotted back in,
  // their position and their printed number no longer agree, so the old
  // `tokenNumber - currentTokenNumber - 1` arithmetic was wrong for everyone behind
  // them. The live stream still drives the "now serving" figure instantly.
  const isParked = tokenStatus === "parked";
  const isBeingSeen =
    !isParked && (state.currentTokenNumber === tokenNumber || tokenStatus === "serving");
  const isDone = tokenStatus === "completed";
  const isSkipped = tokenStatus === "skipped" || tokenStatus === "no_show";
  const isAlmostUp = !isBeingSeen && !isDone && !isSkipped && !isParked && peopleAhead <= 2;

  const waitMinutes = peopleAhead * consultMinutes + state.emergencyDelayMinutes;

  return (
    <div className="space-y-4">
      <Card
        className={cn(
          "overflow-hidden rounded-3xl border-white/40 glass shadow-brand-lg transition-all dark:border-white/10",
          isBeingSeen && "border-live/60 shadow-live",
          isAlmostUp && "border-warn/60",
          isParked && "border-warn ring-warn/40",
        )}
      >
        <CardContent className="relative flex flex-col items-center gap-3 py-10 text-center">
          {isBeingSeen ? (
            <motion.span
              aria-hidden
              className="absolute top-8 size-44 rounded-full bg-live/25 blur-xl"
              animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : null}

          <p className="relative z-10 text-sm text-muted-foreground">Your token</p>
          <p
            className={cn(
              "relative z-10 font-mono text-6xl font-bold tabular-nums",
              isBeingSeen ? "animate-brand-gradient text-brand-gradient" : "text-foreground",
            )}
          >
            {tokenNumber}
          </p>
          <p className="relative z-10 font-medium">{patientName}</p>

          <div className="relative z-10 pt-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${isBeingSeen}-${isDone}-${isSkipped}-${isParked}-${peopleAhead}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {isParked ? (
                  <div className="space-y-1">
                    <Badge className="gap-1.5 rounded-full border-transparent bg-warn px-3 text-warn-foreground">
                      <PauseCircleIcon className="size-3.5" />
                      On hold
                    </Badge>
                    <p className="text-sm font-medium">
                      You were called and missed. Please see the reception desk.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Your token number is unchanged — staff will call you back in.
                    </p>
                  </div>
                ) : isDone ? (
                  <Badge variant="secondary" className="gap-1.5">
                    <CheckCircle2Icon className="size-3.5" />
                    Consultation complete
                  </Badge>
                ) : isSkipped ? (
                  <Badge variant="outline" className="gap-1.5">
                    <TriangleAlertIcon className="size-3.5" />
                    Missed — please see the desk
                  </Badge>
                ) : isBeingSeen ? (
                  <Badge className="gap-1.5 rounded-full border-transparent bg-live px-3 text-live-foreground shadow-live">
                    <BellRingIcon className="size-3.5" />
                    It&apos;s your turn — go in now
                  </Badge>
                ) : (
                  <div className="space-y-1">
                    <p className="text-2xl font-semibold">
                      {peopleAhead === 0 ? "You're next" : `${peopleAhead} ahead of you`}
                    </p>
                    <p className="text-sm text-muted-foreground">{formatWait(waitMinutes)}</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/45">
        <CardContent className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Now serving</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={state.currentTokenNumber}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -14, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="font-mono text-lg font-semibold tabular-nums"
            >
              {state.currentTokenNumber || "—"}
            </motion.span>
          </AnimatePresence>
        </CardContent>
      </Card>

      {state.emergencyDelayMinutes > 0 ? (
        <p className="text-center text-sm text-warn">
          The doctor is running about {state.emergencyDelayMinutes} min behind.
        </p>
      ) : null}

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        {connection === "offline" ? (
          <>
            <WifiOffIcon className="size-3" />
            Reconnecting…
          </>
        ) : (
          <>
            <RadioIcon
              className={cn("size-3", connection === "live" && "animate-pulse text-live")}
            />
            {connection === "live" ? "Live" : connection === "polling" ? "Updating" : "Connecting…"}
          </>
        )}
      </p>
    </div>
  );
}
