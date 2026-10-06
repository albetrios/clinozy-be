import { describe, expect, it } from 'vitest';
import { middlewarePlugins } from '@/shared/middlewares/index.js';
import authMiddleware from '@/shared/middlewares/core/auth.middleware.js';
import requestLifecycleMiddleware from '@/shared/middlewares/core/request-lifecycle.middleware.js';
import rateLimitMiddleware from '@/shared/middlewares/rate-limit/rate-limit.middleware.js';

/**
 * Regression test for middleware ordering. Fastify `onResponse` hooks run FIFO, so the request
 * lifecycle coordinator must be registered first for its idempotency-cache → outbox-flush hook to
 * run before any other. Per-route rate limits key on the principal, so the limiter runs after auth.
 */
describe('middleware registration order', () => {
  const order = middlewarePlugins as readonly unknown[];

  it('registers the request lifecycle coordinator first', () => {
    expect(order.indexOf(requestLifecycleMiddleware)).toBe(0);
  });

  it('rate limits after authentication so per-principal keys are available', () => {
    const authIndex = order.indexOf(authMiddleware);
    const rateLimitIndex = order.indexOf(rateLimitMiddleware);

    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(rateLimitIndex).toBeGreaterThan(authIndex);
  });
});
