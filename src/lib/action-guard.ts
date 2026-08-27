import "server-only";

import { isDatabaseUnavailable } from "@/lib/db";

/**
 * Next signals `redirect()` and `notFound()` by throwing. Those must pass straight
 * through a catch block or navigation silently turns into an error message.
 */
function isNextControlFlow(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") ||
      digest === "NEXT_NOT_FOUND" ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  );
}

/**
 * Turns an infrastructure failure inside a Server Action into a message the form can
 * render, instead of letting it escape to the error boundary as a 500.
 *
 * Without this a database outage produced two errors: the driver failure, and then a
 * React serialisation error on top of it, which is what actually reached the user.
 */
export async function guardAction<T>(
  run: () => Promise<T>,
  onFailure: (message: string) => T,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isNextControlFlow(error)) throw error;

    if (isDatabaseUnavailable(error)) {
      return onFailure("Cannot reach the database right now. Please try again in a moment.");
    }

    // Anything else is a genuine bug: log it in full, show the user nothing specific.
    console.error("[action] unexpected failure:", error);
    return onFailure("Something went wrong. Please try again.");
  }
}
