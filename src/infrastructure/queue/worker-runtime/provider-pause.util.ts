import type { Queue } from 'bullmq';

/**
 * A `max` no counter reaches: BullMQ's manual pause stores `Number.MAX_SAFE_INTEGER` in the limiter
 * key, so asking for the rate-limit TTL at this `max` reports the pause and never the limiter's
 * ordinary per-second count.
 */
export const PAUSE_SENTINEL_MAX_JOBS = Number.MAX_SAFE_INTEGER;

/**
 * Milliseconds left on a queue's provider pause, or 0 when it is not paused.
 *
 * @remarks
 * - **Algorithm:** BullMQ `getRateLimitTtl(Number.MAX_SAFE_INTEGER)` — the pause sets the limiter
 *   key to that value; the limiter's own per-second counter never gets near it.
 * - **Failure modes:** a Redis error propagates.
 * - **Side effects:** one Redis script call.
 * - **Notes:** read by worker readiness, so a paused queue with work waiting is not "stalled", and
 *   reported per queue on the `/readyz` body.
 */
export async function getProviderPauseLeftMs(
  queue: Pick<Queue, 'getRateLimitTtl'>,
): Promise<number> {
  const pauseLeftMs = await queue.getRateLimitTtl(PAUSE_SENTINEL_MAX_JOBS);
  return pauseLeftMs > 0 ? pauseLeftMs : 0;
}
