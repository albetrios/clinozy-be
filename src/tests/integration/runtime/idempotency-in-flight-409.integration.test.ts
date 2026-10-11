import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { cleanupTestRedis } from '@/tests/helpers/test-redis.js';
import { buildIdempotencyCacheKey } from '@/shared/utils/idempotency/idempotency-key.util.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import type { FastifyInstance } from 'fastify';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { buildInFlightIdempotencyEntry } from '@/tests/helpers/idempotency-entry.helper.js';

describe('Integration: idempotency in-flight returns 409', () => {
  let application: FastifyInstance;

  beforeAll(async () => {
    const testApplication = await createTestApp();
    application = testApplication.app;
  });

  afterAll(async () => {
    await application.close();
  });

  beforeEach(async () => {
    await cleanupTestRedis();
  });

  it('returns 409 conflict_in_flight for an entry it cannot read (never replays or overwrites it)', async () => {
    const user = await createTestUser();
    const token = await generateTestToken({ userId: user.public_id });
    const idempotencyKey = `test-in-flight-${Date.now()}`;
    const requestUrl = testApiPath('/tenancy/organizations');
    const payload = { name: 'Org', slug: `org-${Date.now()}` };
    const cacheKey = buildIdempotencyCacheKey({
      idempotencyKey,
      scope: { userId: user.public_id },
    });
    await redisConnection.set(
      cacheKey,
      JSON.stringify({ statusCode: 202, body: '{}', headers: {} }),
      'EX',
      60,
    );

    const originalEntry = await redisConnection.get(cacheKey);
    expect(originalEntry).not.toBeNull();

    const response = await application.inject({
      method: 'POST',
      url: requestUrl,
      headers: {
        'X-Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(409);
    expect(await redisConnection.get(cacheKey)).toBe(originalEntry);
    const body = response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('conflict_in_flight');
  });

  it('returns 409 for explicit in_flight state', async () => {
    const user = await createTestUser();
    const token = await generateTestToken({ userId: user.public_id });
    const idempotencyKey = `test-in-flight-explicit-${Date.now()}`;
    const requestUrl = testApiPath('/tenancy/organizations');
    const payload = { name: 'Org 2', slug: `org2-${Date.now()}` };
    const cacheKey = buildIdempotencyCacheKey({
      idempotencyKey,
      scope: { userId: user.public_id },
    });
    await redisConnection.set(
      cacheKey,
      buildInFlightIdempotencyEntry({
        method: 'POST',
        routePath: testApiPath('/tenancy/organizations'),
        body: payload,
      }),
      'EX',
      60,
    );

    const originalEntry = await redisConnection.get(cacheKey);
    expect(originalEntry).not.toBeNull();

    const response = await application.inject({
      method: 'POST',
      url: requestUrl,
      headers: {
        'X-Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(409);
    expect(await redisConnection.get(cacheKey)).toBe(originalEntry);
  });
});
