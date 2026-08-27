"use client";

import { useEffect } from "react";
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Root error boundary. Deliberately shows no error text: this is reachable by patients,
 * and a database or provider message would leak internals to a waiting room. The real
 * error goes to the server logs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[boundary]", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <TriangleAlertIcon className="size-6" />
      </span>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The queue is still running. Try again, or ask at the reception desk.
        </p>
      </div>
      <Button onClick={reset}>
        <RotateCcwIcon className="size-4" />
        Try again
      </Button>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
      ) : null}
    </main>
  );
}
