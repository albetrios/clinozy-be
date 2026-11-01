import { describe, expect, it, vi } from 'vitest';

import { readinessProbeTimeout } from '@/shared/utils/infrastructure/readiness-probe-timeout.util.js';

describe('readinessProbeTimeout', () => {
  it('rejects when the promise does not resolve before the deadline', async () => {
    vi.useFakeTimers();
    try {
      const neverResolvesPromise = new Promise<boolean>(() => {
        /* intentionally hanging */
      });

      const racePromise = readinessProbeTimeout({
        incomingPromise: neverResolvesPromise,
        timeoutMilliseconds: 50,
        probeLabelForErrors: 'slow_probe_label',
      });

      const rejectionExpectationPromise = expect(racePromise).rejects.toThrow(
        'health_ready_timeout:slow_probe_label',
      );

      await vi.advanceTimersByTimeAsync(50);

      await rejectionExpectationPromise;
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves when the promise settles before the deadline', async () => {
    const fastResolvedPromise = Promise.resolve(42);

    await expect(
      readinessProbeTimeout({
        incomingPromise: fastResolvedPromise,
        timeoutMilliseconds: 1_000,
        probeLabelForErrors: 'fast_probe_label',
      }),
    ).resolves.toBe(42);
  });

  // D-7: the deadline timer was never cleared, so every fast probe left a pending timer that
  // held its closure (and the event loop) until it fired.
  it.each([
    ['resolves', () => Promise.resolve('ready')],
    ['rejects', () => Promise.reject(new Error('probe_failed'))],
  ])('clears its deadline timer when the probe %s first', async (_outcome, makeProbe) => {
    vi.useFakeTimers();
    try {
      const race = readinessProbeTimeout({
        incomingPromise: makeProbe(),
        timeoutMilliseconds: 5_000,
        probeLabelForErrors: 'cleared_probe_label',
      });
      await race.catch(() => undefined);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears its deadline timer when the deadline wins', async () => {
    vi.useFakeTimers();
    try {
      const race = readinessProbeTimeout({
        incomingPromise: new Promise<never>(() => {
          /* intentionally hanging */
        }),
        timeoutMilliseconds: 50,
        probeLabelForErrors: 'slow_probe_label',
      });
      const settled = race.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(50);
      expect(await settled).toBeInstanceOf(Error);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
