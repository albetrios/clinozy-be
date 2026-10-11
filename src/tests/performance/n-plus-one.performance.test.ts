import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { generateTestToken, generateSuperAdminToken } from '@/tests/helpers/test-auth.js';
import type { FastifyInstance } from 'fastify';
import type { TestRequestAgent, TestRequestResponse } from '@/tests/helpers/test-app.js';

/**
 * Small-fixture response-time and in-process concurrency checks.
 * Timing ceilings do not establish query-count bounds or absence of N+1 queries.
 */
describe('Performance: small-fixture response budgets', () => {
  let app: FastifyInstance;
  let request: TestRequestAgent;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    request = testApp.request;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('lists 20 organizations within the local response-time budget', {
    timeout: 30000,
  }, async () => {
    const user = await createTestUser();
    const token = await generateTestToken({ userId: user.public_id });

    const uniqueSuffix = Date.now();
    // Create 20 organizations with guaranteed-unique slugs
    for (let index = 0; index < 20; index++) {
      await createTestOrganization({
        ownerUserId: user.id,
        name: `Perf Org ${index}`,
        slug: `perf-organization-${index}-${uniqueSuffix}-${index}`,
      });
    }

    const start = performance.now();
    const response = await request
      .get('/api/v1/users/me/organizations')
      .set('Authorization', `Bearer ${token}`);
    const duration = performance.now() - start;

    expect(response.status).toBe(200);
    // Allow up to 15 seconds for local Docker / CI databases (setup is sequential)
    expect(duration).toBeLessThan(15000);
  });

  it('lists a 21-user fixture within the local admin response-time budget', {
    timeout: 15000,
  }, async () => {
    // Create 20 users
    for (let i = 0; i < 20; i++) {
      await createTestUser({ email: `user${i}@perf.test` });
    }

    const adminUser = await createTestUser({ email: 'admin@perf.test' });
    const token = await generateSuperAdminToken(adminUser.public_id);

    const start = performance.now();
    const response = await request.get('/api/v1/users/').set('Authorization', `Bearer ${token}`);
    const duration = performance.now() - start;

    expect(response.status).toBe(200);
    expect(duration).toBeLessThan(2000);
  });

  it('all 50 concurrent injected liveness requests succeed within the budget', {
    timeout: 15000,
  }, async () => {
    const CONCURRENT_REQUESTS = 50;
    const promises: Array<PromiseLike<TestRequestResponse>> = [];

    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
      promises.push(request.get('/livez'));
    }

    const start = performance.now();
    const responses = await Promise.all(promises);
    const duration = performance.now() - start;

    const okCount = responses.filter((r) => r.status === 200).length;
    expect(responses).toHaveLength(CONCURRENT_REQUESTS);
    expect(okCount).toBe(CONCURRENT_REQUESTS);

    expect(duration).toBeLessThan(8000);
  });
});
