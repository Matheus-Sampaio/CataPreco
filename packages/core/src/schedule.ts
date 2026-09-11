/**
 * Check scheduling helpers — pure functions with injectable randomness/clock.
 */

/** Standard interval options exposed in the UI dropdown, in minutes. */
export const CHECK_INTERVALS = [
  { value: 60, label: "A cada 1 hora" },
  { value: 360, label: "A cada 6 horas" },
  { value: 720, label: "A cada 12 horas" },
  { value: 1440, label: "Diariamente" },
  { value: 10080, label: "Semanalmente" },
] as const;

export function nextCheckAt(
  now: Date,
  intervalMinutes: number,
  rand: () => number = Math.random,
  jitterPct = 0.1,
): Date {
  const base = intervalMinutes * 60_000;
  const jitter = base * jitterPct * (rand() * 2 - 1);
  return new Date(now.getTime() + base + jitter);
}

/** Milliseconds until next check (>= 0). */
export function countdownMs(nextCheckAt: Date, now: Date): number {
  return Math.max(0, nextCheckAt.getTime() - now.getTime());
}

/** "2h 14m", "45m", "agora" */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "agora";
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Progress 0..1 of how much of the interval has elapsed (for progress bars). */
export function intervalProgress(
  intervalMinutes: number,
  nextCheck: Date,
  now: Date,
): number {
  const total = intervalMinutes * 60_000;
  const remaining = countdownMs(nextCheck, now);
  return Math.min(1, Math.max(0, 1 - remaining / total));
}
