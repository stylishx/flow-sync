"use client";

import { AnimatePresence, motion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NowServingProps {
  tokenNumber: number;
  patientName?: string;
  waitingCount: number;
  isLive: boolean;
}

/**
 * The number the whole waiting room is watching. The digits are keyed on the token
 * number so AnimatePresence can swap them, and the ring only pulses while the
 * session is actually active — a pulsing badge on a paused queue reads as "moving"
 * to a patient across the room.
 */
export function NowServing({ tokenNumber, patientName, waitingCount, isLive }: NowServingProps) {
  return (
    <div className="relative flex flex-col items-center gap-4 py-8">
      {isLive ? (
        <motion.span
          aria-hidden
          className="absolute top-10 size-40 rounded-full bg-primary/10"
          animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}

      <Badge variant={isLive ? "default" : "secondary"} className="relative z-10">
        <span
          className={cn("mr-1.5 size-1.5 rounded-full bg-current", isLive && "animate-pulse")}
        />
        {isLive ? "Now serving" : "Queue paused"}
      </Badge>

      <div className="relative z-10 flex h-24 items-center justify-center overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={tokenNumber}
            initial={{ y: 40, opacity: 0, filter: "blur(6px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: -40, opacity: 0, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="font-mono text-7xl font-bold tracking-tight tabular-nums"
          >
            {tokenNumber > 0 ? tokenNumber : "—"}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="relative z-10 text-center">
        <p className="text-lg font-medium">{patientName ?? "Nobody in the chair"}</p>
        <p className="text-sm text-muted-foreground">
          {waitingCount} {waitingCount === 1 ? "patient" : "patients"} still waiting
        </p>
      </div>
    </div>
  );
}
