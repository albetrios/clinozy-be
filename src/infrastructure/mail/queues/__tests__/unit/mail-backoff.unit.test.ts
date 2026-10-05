import { describe, it, expect } from 'vitest';
import { CircuitBreakerOpenError } from '@/infrastructure/resilience/circuit-breaker.js';
import { QUEUE_RETRY_JITTER_RATIO } from '@/infrastructure/queue/queue.constants.js';
import { mailBackoffStrategy } from '@/infrastructure/mail/queues/mail-backoff.util.js';

function expectJitteredDelay(delayMs: number, baseDelayMs: number): void {
  expect(delayMs).toBeGreaterThanOrEqual(baseDelayMs);
  expect(delayMs).toBeLessThanOrEqual(
    baseDelayMs + Math.floor(baseDelayMs * QUEUE_RETRY_JITTER_RATIO),
  );
}

describe('mailBackoffStrategy', () => {
  it('waits out the open Resend circuit, plus jitter so the backlog does not hit the probe at once', () => {
    const error = new CircuitBreakerOpenError('resend', 45_000, 'open');
    expectJitteredDelay(mailBackoffStrategy(3, 'custom', error), 45_000);
  });

  it('backs off exponentially from five seconds, with jitter, on transport failures', () => {
    expectJitteredDelay(mailBackoffStrategy(1, 'custom', new Error('resend.down')), 5_000);
    expectJitteredDelay(mailBackoffStrategy(2, 'custom', new Error('resend.down')), 10_000);
    expectJitteredDelay(mailBackoffStrategy(3, 'custom', new Error('resend.down')), 20_000);
  });
});
