import { describe, expect, it } from 'vitest';
import { CircuitBreakerOpenError } from '@/infrastructure/resilience/circuit-breaker.js';
import { QUEUE_RETRY_JITTER_RATIO } from '@/infrastructure/queue/queue.constants.js';
import { TEN_SECONDS_MS } from '@/shared/constants/ttl.constants.js';
import { stripeWebhookBackoffStrategy } from '@/domains/billing/sub-domains/stripe-webhook/queues/stripe-webhook-backoff.util.js';

function expectJitteredDelay(delayMs: number, baseDelayMs: number): void {
  expect(delayMs).toBeGreaterThanOrEqual(baseDelayMs);
  expect(delayMs).toBeLessThanOrEqual(
    baseDelayMs + Math.floor(baseDelayMs * QUEUE_RETRY_JITTER_RATIO),
  );
}

/**
 * The `stripe-webhook` queue declares `attempts: 5` with `backoff: { type: 'custom' }`, so this
 * function *is* the retry curve for every failed webhook job. A wrong curve means either
 * hammering Stripe (too flat) or pushing events past the 5-attempt DLQ threshold before the
 * outage clears (too steep) — neither is visible from any other test. Every delay carries up to
 * 20% jitter on top of the curve, so jobs that failed together do not retry together.
 */
describe('stripe-webhook-backoff.util', () => {
  it('starts the exponential curve at 10s on the first attempt', () => {
    expectJitteredDelay(
      stripeWebhookBackoffStrategy(1, 'custom', new Error('boom')),
      TEN_SECONDS_MS,
    );
  });

  it('doubles on each subsequent attempt', () => {
    const error = new Error('boom');
    expectJitteredDelay(stripeWebhookBackoffStrategy(2, 'custom', error), TEN_SECONDS_MS * 2);
    expectJitteredDelay(stripeWebhookBackoffStrategy(3, 'custom', error), TEN_SECONDS_MS * 4);
    expectJitteredDelay(stripeWebhookBackoffStrategy(4, 'custom', error), TEN_SECONDS_MS * 8);
  });

  it("stays monotonically increasing across the queue's five configured attempts", () => {
    const error = new Error('boom');
    const delays = [1, 2, 3, 4, 5].map((attempt) =>
      stripeWebhookBackoffStrategy(attempt, 'custom', error),
    );

    // Doubling outruns 20% jitter, so the curve rises even when one draw is high and the next low.
    for (let index = 1; index < delays.length; index++) {
      expect(delays[index]).toBeGreaterThan(delays[index - 1] as number);
    }
    // The curve is bounded by the queue's `attempts: 5`, not by an internal clamp: the final
    // retry waits 160s (plus jitter), so a job is dead-lettered ~5 minutes into an outage.
    expectJitteredDelay(delays.at(-1) as number, TEN_SECONDS_MS * 16);
  });

  it('never returns a non-positive delay for attempt 0 or a negative attempt count', () => {
    // `Math.max(attemptsMade, 1)` guards the exponent. Without it, attempt 0 would yield a
    // half-window (5s) and negative input would produce fractional millisecond delays that
    // BullMQ treats as an immediate re-run — a hot retry loop against Stripe.
    const error = new Error('boom');
    expectJitteredDelay(stripeWebhookBackoffStrategy(0, 'custom', error), TEN_SECONDS_MS);
    expectJitteredDelay(stripeWebhookBackoffStrategy(-3, 'custom', error), TEN_SECONDS_MS);
  });

  it("defers to the circuit breaker's retryAfterMs instead of the exponential curve", () => {
    // When the Stripe circuit is open, the breaker already knows when it will next probe.
    // Retrying before then is guaranteed to fail and burns one of the five attempts; the jitter
    // keeps the whole backlog from hitting the half-open probe at the same instant.
    const retryAfterMs = 42_000;
    const circuitOpen = new CircuitBreakerOpenError('stripe', retryAfterMs, 'circuit open');

    expectJitteredDelay(stripeWebhookBackoffStrategy(1, 'custom', circuitOpen), retryAfterMs);
    expectJitteredDelay(stripeWebhookBackoffStrategy(4, 'custom', circuitOpen), retryAfterMs);
  });

  it('falls back to the exponential curve when no error is supplied', () => {
    expectJitteredDelay(stripeWebhookBackoffStrategy(2, undefined, undefined), TEN_SECONDS_MS * 2);
  });
});
