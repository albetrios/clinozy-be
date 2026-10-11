import { FIFTEEN_SECONDS_MS, FIVE_SECONDS_MS } from '@/shared/constants/index.js';
import { env } from '@/shared/config/env.config.js';

/** Default drain budget for worker.close() and API shutdown when SHUTDOWN_TIMEOUT_MS is unset. */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = FIFTEEN_SECONDS_MS;

/** Watchdog fires after internal timeout + buffer so in-flight drains can finish. */
export const SHUTDOWN_WATCHDOG_BUFFER_MS = FIVE_SECONDS_MS;

/** Per-component drain budget (env override or {@link DEFAULT_SHUTDOWN_TIMEOUT_MS}). */
export function getShutdownTimeoutMs(): number {
  return env.SHUTDOWN_TIMEOUT_MS ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
}

/** Watchdog deadline = drain budget + {@link SHUTDOWN_WATCHDOG_BUFFER_MS}; force-exit fires past this. */
export function getShutdownWatchdogMs(): number {
  return getShutdownTimeoutMs() + SHUTDOWN_WATCHDOG_BUFFER_MS;
}

/** When the close budget runs out — set once, when shutdown begins ({@link startShutdownBudget}). */
let shutdownDeadlineAt: number | undefined;

/**
 * Starts the one close budget every shutdown step shares (worker close, queue and pool drains).
 *
 * @remarks
 * Each step used to take the full {@link getShutdownTimeoutMs} for itself, so two slow steps in a
 * row outlasted the force-exit watchdog (budget + buffer) and the process was killed mid-drain.
 * Idempotent: a second signal keeps the first deadline.
 */
export function startShutdownBudget(): void {
  shutdownDeadlineAt ??= Date.now() + getShutdownTimeoutMs();
}

/**
 * What is left of the close budget (ms, never below 0) — the full budget when shutdown has not
 * begun (a script closing its pool on exit).
 */
export function getRemainingShutdownBudgetMs(): number {
  if (shutdownDeadlineAt === undefined) return getShutdownTimeoutMs();
  return Math.max(0, shutdownDeadlineAt - Date.now());
}

/** Test-only: forget the shutdown deadline. */
export function resetShutdownBudgetForTests(): void {
  shutdownDeadlineAt = undefined;
}
