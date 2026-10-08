/**
 * The shared organization request budget is one Redis counter per organization.
 * Exhausting organization A must not throttle organization B, and two actors in
 * one organization share that counter (the key has no actor segment).
 */
import Fastify, { type FastifyRequest } from 'fastify';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connectRedis, redisConnection } from '@/infrastructure/cache/redis.client.js';
import {
  ORGANIZATION_REQUEST_BUDGET_KEY_PREFIX,
  ORGANIZATION_REQUEST_BUDGET_MAX,
  organizationRequestBudgetKey,
} from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import rateLimitMiddleware from '@/shared/middlewares/rate-limit/rate-limit.middleware.js';

function budgetKey(organizationPublicId: string): string {
  return `${ORGANIZATION_REQUEST_BUDGET_KEY_PREFIX}${organizationRequestBudgetKey(organizationPublicId)}`;
}

describe('Security: organization request budget isolation', () => {
  const keysToDelete: string[] = [];
  let application: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    await connectRedis();
  });

  afterEach(async () => {
    if (keysToDelete.length > 0) {
      await redisConnection.del(...keysToDelete);
      keysToDelete.length = 0;
    }
    if (application) {
      await application.close();
    }
  });

  async function registerScopedRoute(): Promise<void> {
    application = Fastify();
    await application.register(rateLimitMiddleware);
    application.get(
      '/scoped',
      {
        preHandler: async (request: FastifyRequest) => {
          const organizationPublicId = request.headers['x-test-organization'];
          (request as { auth: { organizationPublicId: string } }).auth = {
            organizationPublicId:
              typeof organizationPublicId === 'string' ? organizationPublicId : '',
          };
        },
      },
      async () => ({ ok: true }),
    );
    await application.ready();
  }

  async function seedBudget(organizationPublicId: string, count: number): Promise<void> {
    const key = budgetKey(organizationPublicId);
    keysToDelete.push(key);
    await redisConnection.set(key, String(count), 'PX', 60_000);
  }

  it('does not let organization A exhausting the budget throttle organization B', async () => {
    const organizationA = 'org_budget_isolation_a';
    const organizationB = 'org_budget_isolation_b';
    await seedBudget(organizationA, ORGANIZATION_REQUEST_BUDGET_MAX);
    keysToDelete.push(budgetKey(organizationB));
    await registerScopedRoute();

    const exhausted = await application.inject({
      method: 'GET',
      url: '/scoped',
      headers: { 'x-test-organization': organizationA, 'x-test-actor': 'actor-a' },
    });
    const otherOrganization = await application.inject({
      method: 'GET',
      url: '/scoped',
      headers: { 'x-test-organization': organizationB, 'x-test-actor': 'actor-b' },
    });

    expect(exhausted.statusCode).toBe(429);
    expect(otherOrganization.statusCode).toBe(200);
  });

  it('makes two actors in one organization share the budget', async () => {
    const organizationPublicId = 'org_budget_shared_actors';
    await seedBudget(organizationPublicId, ORGANIZATION_REQUEST_BUDGET_MAX - 1);
    await registerScopedRoute();

    const firstActor = await application.inject({
      method: 'GET',
      url: '/scoped',
      headers: { 'x-test-organization': organizationPublicId, 'x-test-actor': 'actor-one' },
    });
    const secondActor = await application.inject({
      method: 'GET',
      url: '/scoped',
      headers: { 'x-test-organization': organizationPublicId, 'x-test-actor': 'actor-two' },
    });

    expect(firstActor.statusCode).toBe(200);
    expect(secondActor.statusCode).toBe(429);
  });
});
