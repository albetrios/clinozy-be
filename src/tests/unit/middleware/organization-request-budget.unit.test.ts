import Fastify, { type FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { redisEval } = vi.hoisted(() => ({
  redisEval: vi.fn(),
}));

vi.mock('@fastify/rate-limit', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/config/env.config.js', () => ({
  env: {
    NODE_ENV: 'development',
    RATE_LIMIT_MAX: 100,
    RATE_LIMIT_ORGANIZATION_MAX: 1000,
    RATE_LIMIT_WINDOW_MS: 60_000,
    REDIS_URL: 'redis://127.0.0.1:6379',
    RATE_LIMIT_RELAXED_CAPS: false,
    DEPLOYMENT_API_REPLICA_COUNT: 1,
  },
}));

vi.mock('@/infrastructure/cache/redis.client.js', () => ({
  redisConnection: { eval: redisEval },
}));

vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/infrastructure/observability/sentry/sentry.js', () => ({
  Sentry: { addBreadcrumb: vi.fn() },
}));

import rateLimitMiddleware from '@/shared/middlewares/rate-limit/rate-limit.middleware.js';

describe('organization request budget', () => {
  let application: ReturnType<typeof Fastify>;

  afterEach(async () => {
    redisEval.mockReset();
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
          (request as { auth: { organizationPublicId: string } }).auth = {
            organizationPublicId: 'org_public_budget',
          };
        },
      },
      async () => ({ ok: true }),
    );
    await application.ready();
  }

  it('rejects an organization that has spent its shared budget', async () => {
    redisEval.mockResolvedValue([1_001, 60_000]);
    await registerScopedRoute();

    const response = await application.inject({ method: 'GET', url: '/scoped' });

    expect(response.statusCode).toBe(429);
    expect(redisEval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'organization-request-budget-organization:org_public_budget',
      '60000',
    );
  });

  it('allows an organization still inside the shared budget', async () => {
    redisEval.mockResolvedValue([1, 60_000]);
    await registerScopedRoute();

    const response = await application.inject({ method: 'GET', url: '/scoped' });

    expect(response.statusCode).toBe(200);
  });

  it('does not count a request that has no organization', async () => {
    application = Fastify();
    await application.register(rateLimitMiddleware);
    application.get('/public', async () => ({ ok: true }));
    await application.ready();

    const response = await application.inject({ method: 'GET', url: '/public' });

    expect(response.statusCode).toBe(200);
    expect(redisEval).not.toHaveBeenCalled();
  });
});
