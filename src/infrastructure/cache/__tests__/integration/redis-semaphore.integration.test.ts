import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import {
  RedisSemaphoreFullError,
  withRedisSemaphore,
} from '@/infrastructure/cache/redis-semaphore.util.js';

/** A latch a test opens by hand. */
function latch(): { opened: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/**
 * The counting semaphore behind the export slots (D-4), on the real Redis: `limit` holders at
 * once, the next refused, a slot back after a release or once its claim lapses.
 */
describe('withRedisSemaphore — integration (D-4)', () => {
  let app: FastifyInstance;

  // The app connects the shared Redis client (the semaphore's).
  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets `limit` holders in, refuses the next, and frees a slot on release', async () => {
    const key = `test:semaphore:${randomUUID()}`;
    const options = { key, limit: 2, ttlSeconds: 30 };
    const gate = latch();
    const holders = [1, 2].map(() => withRedisSemaphore({ options, fn: () => gate.opened }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect(withRedisSemaphore({ options, fn: async () => 'third' })).rejects.toBeInstanceOf(
      RedisSemaphoreFullError,
    );
    gate.open();
    await Promise.all(holders);
    await expect(withRedisSemaphore({ options, fn: async () => 'after' })).resolves.toBe('after');
    expect(await redisConnection.zcard(key)).toBe(0);
  });

  it('frees the slot when the holder throws', async () => {
    const options = { key: `test:semaphore:${randomUUID()}`, limit: 1, ttlSeconds: 30 };
    await expect(
      withRedisSemaphore({
        options,
        fn: async () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow('boom');
    await expect(withRedisSemaphore({ options, fn: async () => 'next' })).resolves.toBe('next');
  });

  it('drops a claim past its TTL — a dead holder does not keep its slot', async () => {
    const key = `test:semaphore:${randomUUID()}`;
    await redisConnection.zadd(key, String(Date.now() - 1000), 'a-dead-holder');
    await expect(
      withRedisSemaphore({ options: { key, limit: 1, ttlSeconds: 30 }, fn: async () => 'in' }),
    ).resolves.toBe('in');
  });
});
