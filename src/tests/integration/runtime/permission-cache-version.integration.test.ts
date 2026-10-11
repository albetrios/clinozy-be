import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectRedis, redisConnection } from '@/infrastructure/cache/redis.client.js';
import {
  getCachedPermissions,
  invalidateOrganizationPermissions,
  setCachedPermissions,
} from '@/domains/tenancy/sub-domains/permission/permission-cache.service.js';
import { cleanupTestRedis } from '@/tests/helpers/test-redis.js';

const runRedisTests = process.env.RUN_REDIS_TESTS === '1';
let redisAvailable = false;

describe.runIf(runRedisTests)('Integration: permission cache version invalidation', () => {
  const testPrefix = `test:perm-version:${Date.now()}`;
  const userId = `${testPrefix}:user`;
  const organizationPublicId = `${testPrefix}:org`;
  const versionKey = `perm:org:${organizationPublicId}:v`;

  beforeAll(async () => {
    try {
      await connectRedis();
      redisAvailable = (await redisConnection.ping()) === 'PONG';
    } catch {
      redisAvailable = false;
    }
  });

  beforeEach(async () => {
    if (redisAvailable) {
      await cleanupTestRedis();
    }
  });

  it.runIf(() => redisAvailable)(
    'treats stale entries as miss after organization version INCR',
    async () => {
      await setCachedPermissions({
        userId,
        organizationId: organizationPublicId,
        codes: ['billing:read'],
        ttlSeconds: 3_600,
      });
      expect(await getCachedPermissions({ userId, organizationId: organizationPublicId })).toEqual([
        'billing:read',
      ]);

      await invalidateOrganizationPermissions(organizationPublicId);
      expect(await redisConnection.get(versionKey)).toBe('1');
      expect(
        await getCachedPermissions({ userId, organizationId: organizationPublicId }),
      ).toBeNull();

      await setCachedPermissions({
        userId,
        organizationId: organizationPublicId,
        codes: ['billing:manage'],
        ttlSeconds: 3_600,
      });
      expect(await getCachedPermissions({ userId, organizationId: organizationPublicId })).toEqual([
        'billing:manage',
      ]);

      await redisConnection.del(`perm:1:${userId}:${organizationPublicId}`, versionKey);
    },
  );

  it.runIf(() => redisAvailable)(
    'supports concurrent organization invalidations via INCR',
    async () => {
      await setCachedPermissions({
        userId,
        organizationId: organizationPublicId,
        codes: ['tenancy:read'],
        ttlSeconds: 3_600,
      });
      await Promise.all([
        invalidateOrganizationPermissions(organizationPublicId),
        invalidateOrganizationPermissions(organizationPublicId),
        invalidateOrganizationPermissions(organizationPublicId),
      ]);
      const version = Number(await redisConnection.get(versionKey));
      expect(version).toBe(3);
      expect(
        await getCachedPermissions({ userId, organizationId: organizationPublicId }),
      ).toBeNull();

      await redisConnection.del(versionKey);
    },
  );
});
