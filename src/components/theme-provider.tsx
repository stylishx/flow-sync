"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Toggles the `.dark` class that `globals.css` keys its dark variant off of
 * (`@custom-variant dark (&:is(.dark *))`). Without this every `dark:` utility in
 * the app is inert.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
