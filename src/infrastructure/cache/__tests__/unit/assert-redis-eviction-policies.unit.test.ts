/**
 * Both boot paths must refuse an evicting cache Redis, and an evicting BullMQ Redis when that
 * endpoint is separate. A shared Redis is checked once. An unreadable INFO stays a warning and
 * is also sent to Sentry so a managed Redis that hides INFO does not fail silently forever.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cacheInfo, bullInfo, separate, captureMessage } = vi.hoisted(() => ({
  cacheInfo: vi.fn(),
  bullInfo: vi.fn(),
  separate: { value: false },
  captureMessage: vi.fn(),
}));

vi.mock('@/infrastructure/cache/redis.client.js', () => ({
  redisConnection: { info: cacheInfo },
}));

vi.mock('@/infrastructure/cache/bullmq-redis.client.js', () => ({
  bullmqRedisConnection: { info: bullInfo },
}));

vi.mock('@/infrastructure/cache/redis-url.util.js', () => ({
  usesSeparateBullMqRedisDatabase: () => separate.value,
}));

vi.mock('@/infrastructure/observability/sentry/sentry.js', () => ({
  captureMessage,
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { assertRedisEvictionPolicies } = await import(
  '@/infrastructure/cache/assert-redis-eviction-policy.js'
);

const NOEVICTION = 'maxmemory:1073741824\r\nmaxmemory_policy:noeviction\r\n';
const VOLATILE_LRU = 'maxmemory:268435456\r\nmaxmemory_policy:volatile-lru\r\n';

beforeEach(() => {
  separate.value = false;
  cacheInfo.mockReset();
  bullInfo.mockReset();
  captureMessage.mockReset();
  cacheInfo.mockResolvedValue(NOEVICTION);
  bullInfo.mockResolvedValue(NOEVICTION);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('assertRedisEvictionPolicies', () => {
  it('checks only REDIS_URL when cache and BullMQ share one Redis', async () => {
    separate.value = false;

    await expect(assertRedisEvictionPolicies()).resolves.toBeUndefined();

    expect(cacheInfo).toHaveBeenCalledTimes(1);
    expect(cacheInfo).toHaveBeenCalledWith('memory');
    expect(bullInfo).not.toHaveBeenCalled();
  });

  it('checks REDIS_URL and then REDIS_BULLMQ_URL when the endpoints are separate', async () => {
    separate.value = true;
    const order: string[] = [];
    cacheInfo.mockImplementation(async () => {
      order.push('REDIS_URL');
      return NOEVICTION;
    });
    bullInfo.mockImplementation(async () => {
      order.push('REDIS_BULLMQ_URL');
      return NOEVICTION;
    });

    await expect(assertRedisEvictionPolicies()).resolves.toBeUndefined();

    expect(order).toEqual(['REDIS_URL', 'REDIS_BULLMQ_URL']);
  });

  it('throws naming REDIS_URL when that endpoint uses volatile-lru', async () => {
    separate.value = true;
    cacheInfo.mockResolvedValue(VOLATILE_LRU);

    await expect(assertRedisEvictionPolicies()).rejects.toThrow(
      /redis\.eviction_policy\.unsafe[\s\S]*REDIS_URL[\s\S]*volatile-lru/,
    );
    expect(bullInfo).not.toHaveBeenCalled();
  });

  it('warns and captures a Sentry warning when INFO memory cannot be read', async () => {
    cacheInfo.mockRejectedValue(new Error('ERR unknown command'));

    await expect(assertRedisEvictionPolicies()).resolves.toBeUndefined();

    expect(captureMessage).toHaveBeenCalledWith(
      'redis.eviction_policy.unreadable',
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({ endpoint: 'REDIS_URL' }),
      }),
    );
  });
});

describe('boot wiring', () => {
  it('calls assertRedisEvictionPolicies from the API and the worker', () => {
    const server = readFileSync(resolve(process.cwd(), 'src/server.ts'), 'utf8');
    const worker = readFileSync(resolve(process.cwd(), 'src/worker.ts'), 'utf8');

    expect(server).toContain('await assertRedisEvictionPolicies()');
    expect(worker).toContain('await assertRedisEvictionPolicies()');
    expect(server).not.toContain('assertRedisEvictionPolicy(');
    expect(worker).not.toContain('assertRedisEvictionPolicy(');
    expect(worker).not.toContain('usesSeparateBullMqRedisDatabase');
  });
});
