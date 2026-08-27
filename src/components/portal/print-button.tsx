"use client";

import { PrinterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PrintButtonProps {
  label?: string;
  /** `fixed` suits a full-page poster; `inline` sits in a normal layout. */
  placement?: "fixed" | "inline";
  variant?: "default" | "outline";
  className?: string;
}

/**
 * Triggers the browser's own print dialogue, which is also how a user saves a PDF
 * ("Destination: Save as PDF"). Deliberately not a PDF library: the browser renders
 * the same CSS the page already uses, and clinic staff already know this dialogue.
 *
 * Always hidden in the printed output via `print:hidden`.
 */
export function PrintButton({
  label = "Print",
  placement = "fixed",
  variant = "default",
  className,
}: PrintButtonProps) {
  return (
    <Button
      variant={variant}
      onClick={() => window.print()}
      className={cn("print:hidden", placement === "fixed" && "fixed top-4 right-4 z-50", className)}
    >
      <PrinterIcon className="size-4" />
      {label}
    </Button>
  );
}
