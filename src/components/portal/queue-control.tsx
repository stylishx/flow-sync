"use client";

import { useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  PauseIcon,
  PlayIcon,
  PauseCircleIcon,
  SkipForwardIcon,
  TriangleAlertIcon,
  UndoIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  addDelayAction,
  callNextAction,
  completeCurrentAction,
  parkCurrentAction,
  recallParkedAction,
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
  parked: QueueRow[];
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
  parked,
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
      <Card className="rounded-3xl">
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
              className="animate-brand-gradient border-transparent bg-brand-gradient text-white shadow-brand hover:opacity-90 sm:col-span-2"
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

            <Button
              variant="outline"
              className="sm:col-span-2"
              disabled={pending || !isActive || currentTokenNumber === 0}
              onClick={() => run(() => parkCurrentAction(sessionId))}
            >
              <PauseCircleIcon className="size-4" />
              Hold — patient not here
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
        {parked.length > 0 ? (
          <Card className="border-warn/40 ring-warn/30">
            <CardContent>
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-warn">
                <PauseCircleIcon className="size-3.5" />
                On hold ({parked.length})
              </h2>
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {parked.map((row) => (
                    <motion.li
                      key={row.id}
                      layout
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24, transition: { duration: 0.15 } }}
                      className="space-y-2 rounded-xl bg-warn/5 px-2.5 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 shrink-0 font-mono text-sm text-muted-foreground tabular-nums">
                          #{row.tokenNumber}
                        </span>
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-xs text-muted-foreground">Call back:</span>
                        {[
                          { label: "Next", after: 0 },
                          { label: "After 2", after: 2 },
                          { label: "After 5", after: 5 },
                        ].map((option) => (
                          <Button
                            key={option.after}
                            size="xs"
                            variant="outline"
                            disabled={pending || !isActive}
                            onClick={() =>
                              run(() => recallParkedAction(sessionId, row.id, option.after))
                            }
                          >
                            <UndoIcon className="size-3" />
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card>
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
          <Card className="bg-card/45">
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
