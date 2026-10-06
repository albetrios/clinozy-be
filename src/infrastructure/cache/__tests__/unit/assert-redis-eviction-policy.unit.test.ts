import { describe, expect, it } from 'vitest';
import { assertRedisEvictionPolicy } from '@/infrastructure/cache/assert-redis-eviction-policy.js';

function redisReporting(info: string) {
  return { info: async () => info };
}

/**
 * BullMQ keeps job data and lock keys in Redis. An evicting Redis drops them exactly when memory
 * fills — under a backlog — and jobs vanish or run twice. The worker refuses to start on one.
 */
describe('assertRedisEvictionPolicy', () => {
  it('passes on noeviction', async () => {
    await expect(
      assertRedisEvictionPolicy({
        client: redisReporting(
          '# Memory\r\nmaxmemory:1073741824\r\nmaxmemory_policy:noeviction\r\n',
        ),
        endpointName: 'REDIS_URL',
      }),
    ).resolves.toBeUndefined();
  });

  it.each(['allkeys-lru', 'volatile-lru', 'allkeys-lfu', 'volatile-ttl'])(
    'refuses %s when memory is limited',
    async (policy) => {
      await expect(
        assertRedisEvictionPolicy({
          client: redisReporting(`maxmemory:268435456\r\nmaxmemory_policy:${policy}\r\n`),
          endpointName: 'REDIS_URL',
        }),
      ).rejects.toThrow(/redis\.eviction_policy\.unsafe/);
    },
  );

  it('passes an evicting policy without a memory limit — nothing is ever evicted', async () => {
    await expect(
      assertRedisEvictionPolicy({
        client: redisReporting('maxmemory:0\r\nmaxmemory_policy:allkeys-lru\r\n'),
        endpointName: 'REDIS_URL',
      }),
    ).resolves.toBeUndefined();
  });

  it('only warns when INFO is unavailable — some managed Redis restrict it', async () => {
    await expect(
      assertRedisEvictionPolicy({
        client: {
          info: async () => {
            throw new Error('ERR unknown command');
          },
        },
        endpointName: 'REDIS_URL',
      }),
    ).resolves.toBeUndefined();
  });
});
