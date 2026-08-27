"use client";

import { PrinterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Hidden in the printed output itself via `print:hidden`. */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()} className="fixed top-4 right-4 print:hidden">
      <PrinterIcon className="size-4" />
      Print
    </Button>
  );
}
