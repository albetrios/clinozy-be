import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import {
  createRedisFallbackRateLimitStore,
  scaleProcessLocalRateLimitCount,
} from '@/shared/middlewares/rate-limit/rate-limit-fallback-store.js';

interface IncrResult {
  current: number;
  ttl: number;
}

function incrAsync(
  store: {
    incr: (
      k: string,
      cb: (e: Error | null, r: IncrResult | null) => void,
      w: number,
      m: number,
    ) => void;
  },
  key: string,
  timeWindow: number,
  max: number,
): Promise<IncrResult> {
  return new Promise((resolve, reject) => {
    store.incr(
      key,
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('no result'));
          return;
        }
        resolve(result);
      },
      timeWindow,
      max,
    );
  });
}

describe('createRedisFallbackRateLimitStore', () => {
  it('counts via Redis when healthy (atomic Lua EVAL returns [current, ttl])', async () => {
    const redis = {
      eval: vi.fn().mockResolvedValue([1, 1000]),
    } as unknown as Redis;
    const StoreCtor = createRedisFallbackRateLimitStore({ redis, replicaCount: 1 });
    const store = new StoreCtor({}) as never;

    const result = await incrAsync(store, '1.2.3.4', 1000, 5);

    expect(result).toEqual({ current: 1, ttl: 1000 });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'fastify-rate-limit-1.2.3.4',
      '1000',
    );
  });

  it('falls over to per-process counting when Redis rejects', async () => {
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as Redis;
    const StoreCtor = createRedisFallbackRateLimitStore({ redis, replicaCount: 1 });
    const store = new StoreCtor({}) as never;

    const first = await incrAsync(store, '9.9.9.9', 1000, 5);
    const second = await incrAsync(store, '9.9.9.9', 1000, 5);

    expect(first.current).toBe(1);
    expect(second.current).toBe(2);
  });

  it('child stores isolate buckets by route prefix', async () => {
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error('down')),
    } as unknown as Redis;
    const StoreCtor = createRedisFallbackRateLimitStore({ redis, replicaCount: 1 });
    const store = new StoreCtor({}) as never as {
      incr: Parameters<typeof incrAsync>[0]['incr'];
      child: (options: { routeInfo: { method: string; url: string } }) => never;
    };
    const child = store.child({ routeInfo: { method: 'POST', url: '/auth/login' } });

    const parentHit = await incrAsync(store, 'ip', 1000, 5);
    const childHit = await incrAsync(child as never, 'ip', 1000, 5);

    // Separate prefixes ⇒ both start at 1 despite the same key.
    expect(parentHit.current).toBe(1);
    expect(childHit.current).toBe(1);
  });

  it('evicts old local buckets instead of growing without bound during Redis outages', async () => {
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error('down')),
    } as unknown as Redis;
    const StoreCtor = createRedisFallbackRateLimitStore({ redis, replicaCount: 1 });
    const store = new StoreCtor({}) as never;

    for (let index = 0; index < 10_000; index++) {
      await incrAsync(store, `ip-${index}`, 60_000, 5);
    }

    await incrAsync(store, 'overflow', 60_000, 5);

    await expect(incrAsync(store, 'ip-0', 60_000, 5)).resolves.toMatchObject({ current: 1 });
    await expect(incrAsync(store, 'ip-9999', 60_000, 5)).resolves.toMatchObject({ current: 2 });
    await expect(incrAsync(store, 'overflow', 60_000, 5)).resolves.toMatchObject({ current: 2 });
  });

  it('divides the in-memory budget by the replica count so N processes do not grant N times max', async () => {
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error('down')),
    } as unknown as Redis;
    const StoreCtor = createRedisFallbackRateLimitStore({ redis, replicaCount: 4 });
    const store = new StoreCtor({}) as never;

    let lastCurrent = 0;
    for (let index = 0; index < 25; index++) {
      lastCurrent = (await incrAsync(store, 'shared', 60_000, 100)).current;
    }
    expect(lastCurrent).toBe(100);

    const overBudget = await incrAsync(store, 'shared', 60_000, 100);
    expect(overBudget.current).toBe(104);
  });

  it('does not scale a budget that is smaller than the replica count', () => {
    expect(scaleProcessLocalRateLimitCount({ localCount: 1, max: 3, replicaCount: 4 })).toBe(1);
    expect(scaleProcessLocalRateLimitCount({ localCount: 2, max: 100, replicaCount: 1 })).toBe(2);
  });

  it('counts the 34th local hit over a max of 100 across 3 replicas', async () => {
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error('down')),
    } as unknown as Redis;
    const StoreCtor = createRedisFallbackRateLimitStore({ redis, replicaCount: 3 });
    const store = new StoreCtor({}) as never;

    let lastCurrent = 0;
    for (let index = 0; index < 33; index++) {
      lastCurrent = (await incrAsync(store, 'shared', 60_000, 100)).current;
    }
    expect(lastCurrent).toBe(99);

    const overBudget = await incrAsync(store, 'shared', 60_000, 100);
    expect(overBudget.current).toBe(102);
  });

  it('allows the first hit when max 2 cannot be split across 3 replicas', async () => {
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error('down')),
    } as unknown as Redis;
    const StoreCtor = createRedisFallbackRateLimitStore({ redis, replicaCount: 3 });
    const store = new StoreCtor({}) as never;

    const first = await incrAsync(store, 'shared', 60_000, 2);
    expect(first.current).toBe(1);
    expect(scaleProcessLocalRateLimitCount({ localCount: 1, max: 2, replicaCount: 3 })).toBe(1);
  });
});
