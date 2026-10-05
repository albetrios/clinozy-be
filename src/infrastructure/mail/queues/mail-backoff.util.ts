import { CircuitBreakerOpenError } from '@/infrastructure/resilience/circuit-breaker.js';
import { addRetryJitter } from '@/infrastructure/queue/retry-jitter.util.js';
import { FIVE_SECONDS_MS } from '@/shared/constants/ttl.constants.js';

/**
 * BullMQ custom backoff for the mail queue: past the Resend circuit's remaining open time when it
 * is open, otherwise exponential from five seconds — both with jitter ({@link addRetryJitter}), so
 * a backlog that failed together does not hit the half-open probe together.
 */
export function mailBackoffStrategy(
  attemptsMade: number,
  _type: string | undefined,
  error: Error | undefined,
): number {
  if (error instanceof CircuitBreakerOpenError) {
    return addRetryJitter(error.retryAfterMs);
  }
  const attemptIndex = Math.max(attemptsMade, 1);
  return addRetryJitter(FIVE_SECONDS_MS * 2 ** (attemptIndex - 1));
}
