import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import type { FastifyInstance } from 'fastify';
import type { TestRequestAgent } from '@/tests/helpers/test-app.js';

/**
 * Concurrent in-process requests — verify every request succeeds through app.inject().
 * TCP listener behavior and external capacity are covered separately by live load tests.
 */
describe('Performance: Concurrent Requests', () => {
  let app: FastifyInstance;
  let request: TestRequestAgent;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    request = testApp.request;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should handle 50 parallel unauthenticated requests', async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => request.get('/livez')));

    expect(results).toHaveLength(50);
    expect(results.map((response) => response.status)).toEqual(Array(50).fill(200));
  });

  it('should handle batched parallel authenticated requests', { timeout: 20000 }, async () => {
    const user = await createTestUser();
    const token = await generateTestToken({ userId: user.public_id });
    const batchSize = 5;
    const batchCount = 4;
    let successCount = 0;

    for (let batch = 0; batch < batchCount; batch += 1) {
      const responses = await Promise.all(
        Array.from({ length: batchSize }, () =>
          request.get('/api/v1/users/me').set('Authorization', `Bearer ${token}`),
        ),
      );
      successCount += responses.filter((response) => response.status === 200).length;
    }

    expect(successCount).toBe(batchSize * batchCount);
  });

  it('should handle mixed read/write concurrent requests in batches', {
    timeout: 20000,
  }, async () => {
    const user = await createTestUser();
    const token = await generateTestToken({ userId: user.public_id });
    const batchSize = 3;
    const batchCount = 4;
    let successfulResponses = 0;

    for (let batch = 0; batch < batchCount; batch += 1) {
      const reads = Array.from({ length: batchSize }, () =>
        request.get('/api/v1/users/me').set('Authorization', `Bearer ${token}`),
      );
      // Independent owners avoid making this availability test a quota/rate-limit test.
      const writerTokens = await Promise.all(
        Array.from({ length: batchSize }, async () => {
          const writer = await createTestUser();
          return generateTestToken({ userId: writer.public_id });
        }),
      );
      const writes = writerTokens.map((writerToken, index) =>
        request
          .post('/api/v1/tenancy/organizations')
          .set('Authorization', `Bearer ${writerToken}`)
          .set('X-Idempotency-Key', `concurrency-${batch}-${index}-${Date.now()}`)
          .send({
            name: `ConcOrg-${batch}-${index}`,
            slug: `conc-${Date.now()}-${batch}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          }),
      );
      const responses = await Promise.all([...reads, ...writes]);
      expect(responses.map((response) => response.status)).toEqual(Array(batchSize * 2).fill(200));
      for (const response of responses.slice(batchSize)) {
        expect(response.body).toMatchObject({ data: { id: expect.any(String) } });
      }
      successfulResponses += responses.filter((response) => response.status === 200).length;
    }

    expect(successfulResponses).toBe(batchSize * 2 * batchCount);
  });
});
