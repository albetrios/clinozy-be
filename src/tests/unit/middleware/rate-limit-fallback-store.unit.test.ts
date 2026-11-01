import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { createRedisFallbackRateLimitStore } from '@/shared/middlewares/rate-limit/rate-limit-fallback-store.js';

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
    const StoreCtor = createRedisFallbackRateLimitStore(redis);
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
    const StoreCtor = createRedisFallbackRateLimitStore(redis);
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
    const StoreCtor = createRedisFallbackRateLimitStore(redis);
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
    const StoreCtor = createRedisFallbackRateLimitStore(redis);
    const store = new StoreCtor({}) as never;

    for (let index = 0; index < 10_000; index++) {
      await incrAsync(store, `ip-${index}`, 60_000, 5);
    }

    await incrAsync(store, 'overflow', 60_000, 5);

    await expect(incrAsync(store, 'ip-0', 60_000, 5)).resolves.toMatchObject({ current: 1 });
    await expect(incrAsync(store, 'ip-9999', 60_000, 5)).resolves.toMatchObject({ current: 2 });
    await expect(incrAsync(store, 'overflow', 60_000, 5)).resolves.toMatchObject({ current: 2 });
  });

  // D-2: the failed-authentication pre-check reads its bucket without counting
  // (`{ increment: false }`), which `@fastify/rate-limit` refuses on a store with no `read`.
  describe('read (non-mutating)', () => {
    function readAsync(store: unknown, key: string): Promise<IncrResult> {
      return new Promise((resolve, reject) => {
        (
          store as {
            read: (
              k: string,
              cb: (e: Error | null, r: IncrResult | null) => void,
              w: number,
              m: number,
            ) => void;
          }
        ).read(
          key,
          (error, result) =>
            error || !result ? reject(error ?? new Error('no result')) : resolve(result),
          1000,
          5,
        );
      });
    }

    it('reads the Redis counter and its TTL', async () => {
      const redis = { eval: vi.fn().mockResolvedValue([3, 400]) } as unknown as Redis;
      const store = new (createRedisFallbackRateLimitStore(redis))({}) as never;

      await expect(readAsync(store, '1.2.3.4')).resolves.toEqual({ current: 3, ttl: 400 });
      const [script, keyCount, key] = vi.mocked(redis.eval).mock.calls[0]!;
      expect(keyCount).toBe(1);
      expect(key).toBe('fastify-rate-limit-1.2.3.4');
      expect(String(script)).not.toContain('INCR');
    });

    it('reads the in-process counter without counting when Redis rejects', async () => {
      const redis = { eval: vi.fn().mockRejectedValue(new Error('down')) } as unknown as Redis;
      const store = new (createRedisFallbackRateLimitStore(redis))({}) as never;

      await expect(readAsync(store, '5.5.5.5')).resolves.toEqual({ current: 0, ttl: 0 });
      await incrAsync(store, '5.5.5.5', 1000, 5);
      const afterOne = await readAsync(store, '5.5.5.5');
      const again = await readAsync(store, '5.5.5.5');

      expect(afterOne.current).toBe(1);
      expect(again.current).toBe(1);
    });
  });
});
