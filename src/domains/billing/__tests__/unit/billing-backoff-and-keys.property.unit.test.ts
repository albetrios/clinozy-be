import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { stripeWebhookBackoffStrategy } from '@/domains/billing/sub-domains/stripe-webhook/queues/stripe-webhook-backoff.util.js';
import { buildStripeIdempotencyKey } from '@/domains/billing/sub-domains/subscription/subscription.service.js';
import { CircuitBreakerOpenError } from '@/infrastructure/resilience/circuit-breaker.js';
import { QUEUE_RETRY_JITTER_RATIO } from '@/infrastructure/queue/queue.constants.js';
import { TEN_SECONDS_MS } from '@/shared/constants/ttl.constants.js';
import { propertyAssertOptions } from '@/tests/helpers/fast-check-property.util.js';

const propertyOptions = propertyAssertOptions();

/** The jitter added on top of a base delay: never shorter, at most 20% longer. */
function expectJitteredDelay(delayMs: number, baseDelayMs: number): void {
  expect(delayMs).toBeGreaterThanOrEqual(baseDelayMs);
  expect(delayMs).toBeLessThanOrEqual(
    baseDelayMs + Math.floor(baseDelayMs * QUEUE_RETRY_JITTER_RATIO),
  );
}

/**
 * Layer 2 (property) for billing's two pure rule systems: the webhook retry curve (a wrong curve
 * either hammers Stripe or dead-letters events early) and the namespaced Stripe idempotency key
 * (a collision across operations would replay one Stripe mutation as another). The example suite
 * pins attempts 1, 3, and 5; these pin the shape of the whole curve and the injectivity of the
 * whole key space.
 */

describe('stripe webhook backoff curve (property)', () => {
  it('is strictly increasing across consecutive real attempts and never non-positive', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), (attempt) => {
        const delay = stripeWebhookBackoffStrategy(attempt, undefined, undefined);
        const next = stripeWebhookBackoffStrategy(attempt + 1, undefined, undefined);
        expect(delay).toBeGreaterThan(0);
        // A flat or shrinking curve retries a failing provider at full speed — doubling outruns
        // the 20% jitter, so the curve rises whatever the two draws were.
        expect(next).toBeGreaterThan(delay);
        // The curve is 10s · 2^(n-1) plus jitter — the arithmetic the DLQ window is sized on.
        expectJitteredDelay(delay, TEN_SECONDS_MS * 2 ** (attempt - 1));
      }),
      propertyOptions,
    );
  });

  it('clamps attempt 0 and any negative attempt to the first-attempt delay, never a negative one', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10, max: 0 }), (attempt) => {
        // BullMQ should never hand these in, but a negative delay would be scheduled as
        // "immediately, forever" — the clamp is the guard.
        expectJitteredDelay(
          stripeWebhookBackoffStrategy(attempt, undefined, undefined),
          TEN_SECONDS_MS,
        );
      }),
      propertyOptions,
    );
  });

  it('a CircuitBreakerOpenError overrides the curve with its own retryAfterMs, whatever the attempt', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 900_000 }),
        (attempt, retryAfterMs) => {
          const error = new CircuitBreakerOpenError('stripe', retryAfterMs, 'circuit open');
          // While the breaker is open, retrying on the exponential curve would slam a
          // provider that already said "not yet" — the breaker's own clock wins (plus jitter).
          expectJitteredDelay(
            stripeWebhookBackoffStrategy(attempt, undefined, error),
            retryAfterMs,
          );
        },
      ),
      propertyOptions,
    );
  });

  it('five job executions permit four exponential retry waits totaling 150–180 seconds', () => {
    // stripe-webhook.queue.ts configures attempts: 5, including the initial execution.
    const configuredExecutions = 5;
    const total = Array.from({ length: configuredExecutions - 1 }, (_, index) => index + 1)
      .map((attempt) => stripeWebhookBackoffStrategy(attempt, undefined, undefined))
      .reduce((sum, delay) => sum + delay, 0);
    // 10+20+40+80s = 150s, plus at most 20% jitter. This measures retry waits only:
    // processing time, circuit overrides, provider pauses and ledger reclaim cycles are separate.
    expect(total).toBeGreaterThanOrEqual(150_000);
    expect(total).toBeLessThanOrEqual(180_000);
  });
});

describe('stripe idempotency key builder (property)', () => {
  const segment = fc.stringMatching(/^[a-z0-9_-]{1,40}$/);

  it('returns undefined exactly when the client sent no key, for any operation/organization pair', () => {
    fc.assert(
      fc.property(segment, segment, (operation, organization) => {
        // Absent client key → absent Stripe key. Stripe treats an undefined key as
        // "no idempotency"; inventing one here would silently dedupe unrelated calls.
        expect(buildStripeIdempotencyKey(operation, organization, undefined)).toBeUndefined();
      }),
      propertyOptions,
    );
  });

  it('is injective over (operation, organization, clientKey) — no two triples share a key', () => {
    fc.assert(
      fc.property(segment, segment, segment, (operation, organization, clientKey) => {
        const key = buildStripeIdempotencyKey(operation, organization, clientKey);
        // The three-part namespace is what stops the SAME client key reused on cancel and
        // resume (legal at our API) from colliding at Stripe. Splitting must recover the
        // exact triple for ':'-free segments.
        expect(key).toBe(`${operation}:${organization}:${clientKey}`);
        expect(key?.split(':')).toEqual([operation, organization, clientKey]);
      }),
      propertyOptions,
    );
  });
});
