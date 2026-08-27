/**
 * Pure wait-time maths. Deliberately kept out of `@/lib/queue`, which is
 * `server-only` — the portal and patient UIs both render estimates on the client.
 */

/** Minutes until a token at `position` (0-based within the waiting list) is called. */
export function estimateWaitMinutes(
  position: number,
  consultMinutes: number,
  emergencyDelayMinutes: number,
): number {
  return position * consultMinutes + emergencyDelayMinutes;
}

/** "just now" / "~15 min" / "~1 h 20 min" */
export function formatWait(minutes: number): string {
  if (minutes <= 0) return "just now";
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `~${hours} h` : `~${hours} h ${rest} min`;
}
