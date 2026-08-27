"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  BellRingIcon,
  CheckCircle2Icon,
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
  initial: QueueState;
}

export function TokenStatus({
  qrToken,
  tokenNumber,
  patientName,
  tokenStatus,
  consultMinutes,
  initial,
}: TokenStatusProps) {
  const { state, connection } = useQueueStream(qrToken, initial);

  // Derived from the live stream rather than the server render, so the number the
  // patient stares at moves without a refresh.
  const peopleAhead = Math.max(0, tokenNumber - state.currentTokenNumber - 1);
  const isBeingSeen = state.currentTokenNumber === tokenNumber || tokenStatus === "serving";
  const isDone = tokenStatus === "completed";
  const isSkipped = tokenStatus === "skipped" || tokenStatus === "no_show";
  const isAlmostUp = !isBeingSeen && !isDone && !isSkipped && peopleAhead <= 2;

  const waitMinutes = peopleAhead * consultMinutes + state.emergencyDelayMinutes;

  return (
    <div className="space-y-4">
      <Card
        className={cn(
          "overflow-hidden border-border/60 bg-card/70 backdrop-blur-xl transition-colors",
          isBeingSeen && "border-primary bg-primary/5",
          isAlmostUp && "border-amber-500/50",
        )}
      >
        <CardContent className="relative flex flex-col items-center gap-3 py-10 text-center">
          {isBeingSeen ? (
            <motion.span
              aria-hidden
              className="absolute top-8 size-44 rounded-full bg-primary/15"
              animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : null}

          <p className="relative z-10 text-sm text-muted-foreground">Your token</p>
          <p className="relative z-10 font-mono text-6xl font-bold tabular-nums">{tokenNumber}</p>
          <p className="relative z-10 font-medium">{patientName}</p>

          <div className="relative z-10 pt-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${isBeingSeen}-${isDone}-${isSkipped}-${peopleAhead}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {isDone ? (
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
                  <Badge className="gap-1.5">
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

      <Card className="border-border/60 bg-card/50 backdrop-blur-xl">
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
        <p className="text-center text-sm text-amber-600 dark:text-amber-500">
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
              className={cn("size-3", connection === "live" && "animate-pulse text-primary")}
            />
            {connection === "live" ? "Live" : connection === "polling" ? "Updating" : "Connecting…"}
          </>
        )}
      </p>
    </div>
  );
}
