import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { QUEUE_RETRY_JITTER_RATIO } from '@/infrastructure/queue/queue.constants.js';
import { addRetryJitter } from '@/infrastructure/queue/retry-jitter.util.js';

describe('addRetryJitter', () => {
  it('never shortens a delay and adds at most the jitter share of it', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 36_000_000 }), (baseDelayMs) => {
        const delayMs = addRetryJitter(baseDelayMs);
        expect(delayMs).toBeGreaterThanOrEqual(baseDelayMs);
        expect(delayMs).toBeLessThanOrEqual(
          baseDelayMs + Math.floor(baseDelayMs * QUEUE_RETRY_JITTER_RATIO),
        );
        expect(Number.isInteger(delayMs)).toBe(true);
      }),
    );
  });

  it('spreads jobs that failed together across the window instead of retrying them in lockstep', () => {
    const delays = new Set(Array.from({ length: 50 }, () => addRetryJitter(60_000)));
    expect(delays.size).toBeGreaterThan(1);
  });

  it('returns 0 for a non-positive base delay', () => {
    expect(addRetryJitter(0)).toBe(0);
    expect(addRetryJitter(-5_000)).toBe(0);
  });
});
