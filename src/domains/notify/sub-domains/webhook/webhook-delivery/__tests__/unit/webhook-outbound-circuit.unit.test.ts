import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWebhookWithCircuitBreaker,
  getWebhookOutboundCircuitCacheSize,
  invalidateWebhookOutboundCircuit,
  resetWebhookOutboundCircuitsForTesting,
  webhookDeliveryBackoffWithJitter,
} from '@/domains/notify/sub-domains/webhook/webhook-delivery/workers/webhook-outbound-circuit.js';
import { WEBHOOK_DELIVERY_RETRY_DELAYS_MS } from '@/domains/notify/sub-domains/webhook/webhook-delivery/queues/webhook-delivery.queue.js';

/** Mirrors WEBHOOK_CIRCUIT_CACHE_MAX_ENTRIES in webhook-outbound-circuit.ts. */
const WEBHOOK_CIRCUIT_CACHE_MAX_ENTRIES = 5_000;

describe('webhook-outbound-circuit', () => {
  afterEach(() => {
    resetWebhookOutboundCircuitsForTesting();
  });

  it.each(
    WEBHOOK_DELIVERY_RETRY_DELAYS_MS.map((baseDelayMs, index) => [index + 1, baseDelayMs] as const),
  )(
    'webhookDeliveryBackoffWithJitter after failure %i waits the schedule delay plus at most 20%%',
    (attemptsMade, baseDelayMs) => {
      for (let draw = 0; draw < 20; draw += 1) {
        const delayMs = webhookDeliveryBackoffWithJitter(attemptsMade);
        expect(delayMs).toBeGreaterThanOrEqual(baseDelayMs);
        expect(delayMs).toBeLessThanOrEqual(baseDelayMs * 1.2);
      }
    },
  );

  it('webhookDeliveryBackoffWithJitter starts at a minute and tops out at ten hours', () => {
    expect(webhookDeliveryBackoffWithJitter(1)).toBeLessThanOrEqual(72_000);
    expect(webhookDeliveryBackoffWithJitter(99)).toBeGreaterThanOrEqual(10 * 60 * 60_000);
  });

  it('opens circuit for a failing webhook without affecting a healthy webhook', async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error('upstream_500'));
    const healthyFetch = vi
      .fn()
      .mockResolvedValue(new Response('ok', { status: 200, statusText: 'OK' }));

    for (let attemptIndex = 0; attemptIndex < 6; attemptIndex += 1) {
      await expect(
        fetchWebhookWithCircuitBreaker({
          webhookPublicId: 'whk_1',
          webhookUrl: 'https://misbehaving.example/hook',
          init: { method: 'POST' },
          fetchImplementation: failingFetch,
        }),
      ).rejects.toThrow();
    }

    await expect(
      fetchWebhookWithCircuitBreaker({
        webhookPublicId: 'whk_1',
        webhookUrl: 'https://misbehaving.example/hook',
        init: { method: 'POST' },
        fetchImplementation: failingFetch,
      }),
    ).rejects.toThrow(/breaker|open|EOPENBREAKER/i);

    const healthyResponse = await fetchWebhookWithCircuitBreaker({
      webhookPublicId: 'whk_2',
      webhookUrl: 'https://healthy.example/hook',
      init: { method: 'POST' },
      fetchImplementation: healthyFetch,
    });

    expect(healthyResponse.status).toBe(200);
    expect(healthyFetch).toHaveBeenCalled();
  });

  it('reuses the same breaker across a webhook URL change (keyed by id, not URL)', async () => {
    const okFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

    await fetchWebhookWithCircuitBreaker({
      webhookPublicId: 'whk_42',
      webhookUrl: 'https://old.example/hook',
      init: { method: 'POST' },
      fetchImplementation: okFetch,
    });
    expect(getWebhookOutboundCircuitCacheSize()).toBe(1);

    await fetchWebhookWithCircuitBreaker({
      webhookPublicId: 'whk_42',
      webhookUrl: 'https://new.example/hook',
      init: { method: 'POST' },
      fetchImplementation: okFetch,
    });

    // Same id → no new breaker created despite the URL change.
    expect(getWebhookOutboundCircuitCacheSize()).toBe(1);
  });

  it('invalidateWebhookOutboundCircuit drops the cached breaker for a webhook', async () => {
    const okFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

    await fetchWebhookWithCircuitBreaker({
      webhookPublicId: 'whk_7',
      webhookUrl: 'https://example.com/hook',
      init: { method: 'POST' },
      fetchImplementation: okFetch,
    });
    expect(getWebhookOutboundCircuitCacheSize()).toBe(1);

    invalidateWebhookOutboundCircuit('whk_7');
    expect(getWebhookOutboundCircuitCacheSize()).toBe(0);

    // Invalidating an unknown id is a no-op.
    invalidateWebhookOutboundCircuit('whk_9999');
    expect(getWebhookOutboundCircuitCacheSize()).toBe(0);
  });

  it('evicts the least-recently-used breaker once the cache cap is exceeded', async () => {
    const okFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

    for (let index = 0; index < WEBHOOK_CIRCUIT_CACHE_MAX_ENTRIES; index += 1) {
      await fetchWebhookWithCircuitBreaker({
        webhookPublicId: `whk_${String(index)}`,
        webhookUrl: `https://example.com/hook/${String(index)}`,
        init: { method: 'POST' },
        fetchImplementation: okFetch,
      });
    }
    expect(getWebhookOutboundCircuitCacheSize()).toBe(WEBHOOK_CIRCUIT_CACHE_MAX_ENTRIES);

    // Touch the first-inserted entry so FIFO eviction would now choose the wrong one.
    await fetchWebhookWithCircuitBreaker({
      webhookPublicId: 'whk_0',
      webhookUrl: 'https://example.com/hook/0',
      init: { method: 'POST' },
      fetchImplementation: okFetch,
    });

    // Overflow must evict whk_1, the least recently accessed entry, while retaining whk_0.
    await fetchWebhookWithCircuitBreaker({
      webhookPublicId: `whk_${String(WEBHOOK_CIRCUIT_CACHE_MAX_ENTRIES)}`,
      webhookUrl: 'https://example.com/hook/overflow',
      init: { method: 'POST' },
      fetchImplementation: okFetch,
    });

    expect(getWebhookOutboundCircuitCacheSize()).toBe(WEBHOOK_CIRCUIT_CACHE_MAX_ENTRIES);
    invalidateWebhookOutboundCircuit('whk_1');
    expect(getWebhookOutboundCircuitCacheSize()).toBe(WEBHOOK_CIRCUIT_CACHE_MAX_ENTRIES);
    invalidateWebhookOutboundCircuit('whk_0');
    expect(getWebhookOutboundCircuitCacheSize()).toBe(WEBHOOK_CIRCUIT_CACHE_MAX_ENTRIES - 1);
  });

  it('evicts an idle breaker once the idle TTL has elapsed (time-based, distinct from the LRU cap)', async () => {
    // The LRU cap test above covers size-based eviction; the idle-TTL sweep (evictExpiredCircuits,
    // run on every access) is separate and was untested. Freeze Date.now — not useFakeTimers — so
    // opossum's own interval timers keep running while we control the breaker's lastAccessed clock.
    const okFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const IDLE_TTL_MS = 60 * 60 * 1000; // WEBHOOK_CIRCUIT_CACHE_IDLE_TTL_MS (1 hour)
    const base = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(base);

    try {
      await fetchWebhookWithCircuitBreaker({
        webhookPublicId: 'whk_100',
        webhookUrl: 'https://a.example/hook',
        init: { method: 'POST' },
        fetchImplementation: okFetch,
      });
      expect(getWebhookOutboundCircuitCacheSize()).toBe(1);

      // Advance past the idle TTL, then touch a DIFFERENT breaker so the sweep runs first.
      nowSpy.mockReturnValue(base + IDLE_TTL_MS + 1);
      await fetchWebhookWithCircuitBreaker({
        webhookPublicId: 'whk_200',
        webhookUrl: 'https://b.example/hook',
        init: { method: 'POST' },
        fetchImplementation: okFetch,
      });

      // Breaker 100 was idle beyond the TTL and evicted; only 200 remains. Without idle eviction
      // this would be 2.
      expect(getWebhookOutboundCircuitCacheSize()).toBe(1);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
