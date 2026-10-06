import { randomInt } from 'node:crypto';
import { QUEUE_RETRY_JITTER_RATIO } from '@/infrastructure/queue/queue.constants.js';

/**
 * A retry delay with up to {@link QUEUE_RETRY_JITTER_RATIO} of it added at random — for BullMQ
 * custom backoff strategies, so jobs that failed together do not retry together.
 *
 * @remarks
 * - **Algorithm:** `baseDelayMs + randomInt(0, floor(baseDelayMs × QUEUE_RETRY_JITTER_RATIO) + 1)`
 *   — never shorter than the base delay, at most 20% longer.
 * - **Failure modes:** none — a non-positive base delay returns 0.
 * - **Side effects:** draws from the CSPRNG (`crypto.randomInt`, never `Math.random`, so static
 *   analysis does not flag a weak-PRNG hotspot); jitter is not a security primitive.
 * - **Notes:** the built-in exponential backoff takes {@link QUEUE_RETRY_JITTER_RATIO} as its
 *   `jitter` option instead.
 */
export function addRetryJitter(baseDelayMs: number): number {
  if (baseDelayMs <= 0) return 0;
  const jitterCeilingMs = Math.floor(baseDelayMs * QUEUE_RETRY_JITTER_RATIO);
  return baseDelayMs + randomInt(0, jitterCeilingMs + 1);
}
