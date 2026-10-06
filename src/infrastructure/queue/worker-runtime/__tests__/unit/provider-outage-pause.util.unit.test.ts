import { afterEach, describe, expect, it, vi } from 'vitest';
import { DelayedError, UnrecoverableError } from 'bullmq';
import {
  CircuitBreakerOpenError,
  MANAGED_CIRCUIT_BREAKERS,
} from '@/infrastructure/resilience/circuit-breaker.js';
import {
  PROVIDER_OUTAGE_PAUSABLE_LIMITER,
  PROVIDER_OUTAGE_PAUSE_MS,
  ProviderOutageError,
  toProviderOutageError,
} from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';

/**
 * Which failures pause a provider-dependent queue. Getting this wrong either way is costly: an
 * outage read as the job's own failure spends the job's attempts until it is dead-lettered (the
 * email is lost); a job's own failure read as an outage parks a broken job for five minutes at a
 * time instead of letting it fail.
 */
describe('toProviderOutageError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubCircuitState(state: 'CLOSED' | 'OPEN' | 'HALF_OPEN') {
    return vi.spyOn(MANAGED_CIRCUIT_BREAKERS.resend, 'getState').mockResolvedValue(state);
  }

  it("reads the provider's open circuit as an outage without a Redis read — the call never left", async () => {
    const getState = stubCircuitState('CLOSED');
    const circuitOpen = new CircuitBreakerOpenError('resend', 30_000, 'open');

    const outage = await toProviderOutageError({ error: circuitOpen, provider: 'resend' });

    expect(outage).toBeInstanceOf(ProviderOutageError);
    expect(outage?.provider).toBe('resend');
    expect(outage?.cause).toBe(circuitOpen);
    expect(getState).not.toHaveBeenCalled();
  });

  it("does not pause for another provider's open circuit", async () => {
    const outage = await toProviderOutageError({
      error: new CircuitBreakerOpenError('s3', 15_000, 'open'),
      provider: 'resend',
    });
    expect(outage).toBeNull();
  });

  it.each([
    ['OPEN', 'this failure tripped the circuit'],
    ['HALF_OPEN', 'a half-open probe failed'],
  ] as const)(
    'reads a provider failure that leaves the circuit %s as an outage (%s)',
    async (state, _reason) => {
      stubCircuitState(state);
      const providerError = Object.assign(new Error('resend 500'), { statusCode: 500 });

      const outage = await toProviderOutageError({ error: providerError, provider: 'resend' });

      expect(outage).toBeInstanceOf(ProviderOutageError);
      expect(outage?.cause).toBe(providerError);
    },
  );

  it('reads a failure while the circuit stays CLOSED as the job’s own — it spends an attempt', async () => {
    stubCircuitState('CLOSED');
    await expect(
      toProviderOutageError({ error: new Error('resend 500'), provider: 'resend' }),
    ).resolves.toBeNull();
  });

  it('never pauses for a refusal of this one request, whatever the circuit says', async () => {
    const getState = stubCircuitState('OPEN');
    const refusal = Object.assign(new Error('invalid recipient'), {
      countsAsCircuitFailure: false,
    });
    const wrappedRefusal = new Error('outbound failed', { cause: refusal });

    await expect(toProviderOutageError({ error: refusal, provider: 'resend' })).resolves.toBeNull();
    await expect(
      toProviderOutageError({ error: wrappedRefusal, provider: 'resend' }),
    ).resolves.toBeNull();
    expect(getState).not.toHaveBeenCalled();
  });

  it('never pauses for UnrecoverableError or a BullMQ control-flow error', async () => {
    stubCircuitState('OPEN');
    await expect(
      toProviderOutageError({ error: new UnrecoverableError('row gone'), provider: 'resend' }),
    ).resolves.toBeNull();
    await expect(
      toProviderOutageError({ error: new DelayedError(), provider: 'resend' }),
    ).resolves.toBeNull();
  });

  it('passes on an outage a processor already reported, for its own provider only', async () => {
    const reported = new ProviderOutageError({ provider: 'resend', cause: new Error('down') });
    await expect(toProviderOutageError({ error: reported, provider: 'resend' })).resolves.toBe(
      reported,
    );
    await expect(
      toProviderOutageError({ error: reported, provider: 'stripe' }),
    ).resolves.toBeNull();
  });
});

describe('provider outage pause settings', () => {
  it('pauses for five minutes between probes', () => {
    expect(PROVIDER_OUTAGE_PAUSE_MS).toBe(5 * 60_000);
  });

  it('declares a limiter no real workload reaches — it exists only so the pause holds in Redis', () => {
    // Per second, far above anything a worker here processes: the limiter must never throttle.
    expect(PROVIDER_OUTAGE_PAUSABLE_LIMITER.duration).toBe(1_000);
    expect(PROVIDER_OUTAGE_PAUSABLE_LIMITER.max).toBeGreaterThanOrEqual(100_000);
  });
});
