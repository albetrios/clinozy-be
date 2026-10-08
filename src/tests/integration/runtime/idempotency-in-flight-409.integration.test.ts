import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('@/shared/constants/ttl.constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/constants/ttl.constants.js')>();
  return {
    ...actual,
    IDEMPOTENCY_PLACEHOLDER_TTL_SECONDS: 1,
    IDEMPOTENCY_PLACEHOLDER_REFRESH_INTERVAL_MS: 200,
  };
});
import { createTestApp } from '@/tests/helpers/test-app.js';
import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { buildIdempotencyCacheKey } from '@/shared/utils/idempotency/idempotency-key.util.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import type { FastifyInstance } from 'fastify';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { buildInFlightIdempotencyEntry } from '@/tests/helpers/idempotency-entry.helper.js';
import { buildApp } from '@/app.js';

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
    const keys = await redisConnection.keys('*idempotency*');
    if (keys.length > 0) {
      await redisConnection.del(...keys);
    }
  });

  it('returns 409 conflict_in_flight for an entry it cannot read (never replays or overwrites it)', async () => {
    const user = await createTestUser();
    const token = await generateTestToken({ userId: user.public_id });
    const idempotencyKey = `test-in-flight-${Date.now()}`;
    const requestUrl = testApiPath('/tenancy/organizations');
    const payload = { name: 'Org', slug: `org-${Date.now()}` };
    const cacheKey = buildIdempotencyCacheKey(idempotencyKey, { userId: user.public_id });
    await redisConnection.set(
      cacheKey,
      JSON.stringify({ statusCode: 202, body: '{}', headers: {} }),
      'EX',
      60,
    );

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
    const body = response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('conflict_in_flight');
  });

  it('returns 409 for explicit in_flight state', async () => {
    const user = await createTestUser();
    const token = await generateTestToken({ userId: user.public_id });
    const idempotencyKey = `test-in-flight-explicit-${Date.now()}`;
    const requestUrl = testApiPath('/tenancy/organizations');
    const payload = { name: 'Org 2', slug: `org2-${Date.now()}` };
    const cacheKey = buildIdempotencyCacheKey(idempotencyKey, { userId: user.public_id });
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
  });

  it('keeps a short claim alive for a slow handler so a retry is 409 and the write runs once', async () => {
    const application = await buildApp();
    let writes = 0;
    const routePath = testApiPath('/test/slow-idempotent-write');
    application.post(
      routePath,
      {
        onRequest: [application.authenticate],
        config: { idempotencyRequired: true },
      },
      async () => {
        writes += 1;
        await new Promise((resolve) => setTimeout(resolve, 1_600));
        return { written: true };
      },
    );
    await application.ready();

    try {
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const idempotencyKey = `slow-claim-${Date.now()}-abcdef`;
      const headers = {
        'X-Idempotency-Key': idempotencyKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const first = application.inject({
        method: 'POST',
        url: routePath,
        headers,
        payload: { name: 'slow' },
      });
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      const cacheKey = buildIdempotencyCacheKey(idempotencyKey, { userId: user.public_id });
      const remainingTtl = await redisConnection.ttl(cacheKey);
      expect(remainingTtl).toBeGreaterThan(0);
      expect(remainingTtl).toBeLessThanOrEqual(1);
      const retry = await application.inject({
        method: 'POST',
        url: routePath,
        headers,
        payload: { name: 'slow' },
      });
      expect(retry.statusCode).toBe(409);
      const completed = await first;
      expect(completed.statusCode).toBe(200);
      expect(writes).toBe(1);
    } finally {
      await application.close();
    }
  });
});
