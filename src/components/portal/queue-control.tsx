"use client";

import { useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  PauseIcon,
  PlayIcon,
  SkipForwardIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  addDelayAction,
  callNextAction,
  completeCurrentAction,
  setSessionStatusAction,
  skipCurrentAction,
  type ActionState,
} from "@/app/portal/actions";
import { NowServing } from "@/components/portal/now-serving";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { estimateWaitMinutes } from "@/lib/wait";
import { cn } from "@/lib/utils";

export interface QueueRow {
  id: string;
  tokenNumber: number;
  name: string;
  age: number;
  source: "walkin" | "online";
  status: string;
}

interface QueueControlProps {
  sessionId: string;
  status: "scheduled" | "active" | "paused" | "closed";
  currentTokenNumber: number;
  servingName?: string;
  waiting: QueueRow[];
  recent: QueueRow[];
  waitingCount: number;
  consultMinutes: number;
  emergencyDelayMinutes: number;
}

export function QueueControl({
  sessionId,
  status,
  currentTokenNumber,
  servingName,
  waiting,
  recent,
  waitingCount,
  consultMinutes,
  emergencyDelayMinutes,
}: QueueControlProps) {
  const [pending, startTransition] = useTransition();
  const isActive = status === "active";
  const isClosed = status === "closed";

  /** Every control routes through here so one in-flight action blocks the rest. */
  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="overflow-hidden border-border/60 bg-card/70 backdrop-blur-xl">
        <CardContent className="pt-0">
          <NowServing
            tokenNumber={currentTokenNumber}
            patientName={servingName}
            waitingCount={waitingCount}
            isLive={isActive}
          />

          {emergencyDelayMinutes > 0 ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <TriangleAlertIcon className="size-4 shrink-0" />
              Running {emergencyDelayMinutes} min behind — every estimate includes this.
            </motion.div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              size="lg"
              className="sm:col-span-2"
              disabled={pending || !isActive || waitingCount === 0}
              onClick={() => run(() => callNextAction(sessionId))}
            >
              <ChevronRightIcon className="size-4" />
              Call next patient
            </Button>

            <Button
              variant="secondary"
              disabled={pending || !isActive || currentTokenNumber === 0}
              onClick={() => run(() => completeCurrentAction(sessionId))}
            >
              <CheckIcon className="size-4" />
              Complete
            </Button>

            <Button
              variant="secondary"
              disabled={pending || !isActive || waitingCount === 0}
              onClick={() => run(() => skipCurrentAction(sessionId))}
            >
              <SkipForwardIcon className="size-4" />
              Skip
            </Button>
          </div>

          <Separator className="my-4" />

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <ClockIcon className="size-3.5" />
              Emergency delay
            </span>
            {[5, 10, 15].map((minutes) => (
              <Button
                key={minutes}
                size="sm"
                variant="outline"
                disabled={pending || isClosed}
                onClick={() => run(() => addDelayAction(sessionId, minutes))}
              >
                +{minutes}m
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending || isClosed || emergencyDelayMinutes === 0}
              onClick={() => run(() => addDelayAction(sessionId, -emergencyDelayMinutes))}
            >
              Clear
            </Button>

            <div className="ml-auto flex gap-2">
              {isActive ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => setSessionStatusAction(sessionId, "paused"))}
                >
                  <PauseIcon className="size-3.5" />
                  Pause
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || isClosed}
                  onClick={() => run(() => setSessionStatusAction(sessionId, "active"))}
                >
                  <PlayIcon className="size-3.5" />
                  {status === "scheduled" ? "Start" : "Resume"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
          <CardContent>
            <h2 className="mb-3 text-sm font-medium">Waiting ({waitingCount})</h2>
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {waiting.map((row, index) => (
                  <motion.li
                    key={row.id}
                    layout
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24, transition: { duration: 0.15 } }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2.5 py-2",
                      index === 0 && "bg-primary/5 ring-1 ring-primary/20",
                    )}
                  >
                    <span className="w-8 shrink-0 font-mono text-sm text-muted-foreground tabular-nums">
                      #{row.tokenNumber}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.age}y · ~
                        {estimateWaitMinutes(index, consultMinutes, emergencyDelayMinutes)} min
                      </p>
                    </div>
                    {row.source === "online" ? (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Online
                      </Badge>
                    ) : null}
                  </motion.li>
                ))}
              </AnimatePresence>

              {waiting.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  Nobody waiting yet.
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        {recent.length > 0 ? (
          <Card className="border-border/60 bg-card/50 backdrop-blur-xl">
            <CardContent>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recently seen</h2>
              <ul className="space-y-1">
                {recent.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 px-2.5 text-sm text-muted-foreground"
                  >
                    <span className="w-8 shrink-0 font-mono tabular-nums">#{row.tokenNumber}</span>
                    <span className="truncate">{row.name}</span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 text-xs",
                        row.status === "skipped" && "text-destructive",
                      )}
                    >
                      {row.status}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
