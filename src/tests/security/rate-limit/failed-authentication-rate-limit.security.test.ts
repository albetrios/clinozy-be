import { randomInt } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * D-2 — failed authentication and unknown URLs are metered.
 *
 * `@fastify/rate-limit`'s global mode appended its hook to each route's `onRequest` array AFTER
 * `onRequest: [app.authenticate]`, so a 401 never reached it, and the not-found handler is not a
 * route, so it had no limiter at all. A bogus `X-Api-Key` cost a prefix lookup on the pool, as
 * often as a caller liked. This suite runs the real error-handler, auth and rate-limit middleware
 * (Redis-backed store) with a small global cap: production caps, not the relaxed test ones.
 */

const GLOBAL_MAX = 5;
const FAILED_AUTHENTICATION_MAX = 60;

/** A fresh client address per test so buckets from other runs inside the window never count. */
function freshIpv4Address(): string {
  return `198.18.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

function freshIpv6Prefix(): string {
  return `2001:db8:${randomInt(0, 0xffff).toString(16)}:${randomInt(0, 0xffff).toString(16)}`;
}

describe('Security: failed authentication and unknown URLs are rate limited (D-2)', () => {
  let application: FastifyInstance;
  let closeRedis: () => Promise<unknown>;
  const apiKeyAuthenticate = vi.fn(async () => null);
  const previousEnvironment = {
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
    RATE_LIMIT_RELAXED_CAPS: process.env.RATE_LIMIT_RELAXED_CAPS,
  };

  beforeAll(async () => {
    process.env.RATE_LIMIT_MAX = String(GLOBAL_MAX);
    process.env.RATE_LIMIT_RELAXED_CAPS = 'false';
    vi.resetModules();
    const { default: errorHandlerMiddleware } = await import(
      '@/shared/middlewares/core/error-handler.middleware.js'
    );
    const { default: authMiddleware } = await import(
      '@/shared/middlewares/core/auth.middleware.js'
    );
    const { default: rateLimitMiddleware } = await import(
      '@/shared/middlewares/rate-limit/rate-limit.middleware.js'
    );
    const { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } = await import(
      '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js'
    );
    const { connectRedis, redisConnection } = await import(
      '@/infrastructure/cache/redis.client.js'
    );
    const { closeRedisClient } = await import('@/infrastructure/cache/redis-close.util.js');
    // Connect, as the server does at boot, so the counters live in Redis (the production store)
    // rather than in its in-process fallback.
    await connectRedis();
    closeRedis = () =>
      closeRedisClient({ client: redisConnection, timeoutEvent: 'test.redis.close_timeout' });

    application = Fastify({ logger: false });
    await application.register(errorHandlerMiddleware);
    await application.register(authMiddleware);
    await application.register(rateLimitMiddleware);
    // Only the API-key path is exercised: every presented key is unknown.
    application.decorate('tenancyDomain', {
      organizationApiKeyService: { authenticate: apiKeyAuthenticate },
    } as never);
    application.get('/protected', { onRequest: [application.authenticate] }, async () => ({
      ok: true,
    }));
    application.get(
      '/preset',
      { onRequest: [application.authenticate], ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT },
      async () => ({ ok: true }),
    );
    await application.ready();
  });

  afterAll(async () => {
    await application.close();
    await closeRedis();
    process.env.RATE_LIMIT_MAX = previousEnvironment.RATE_LIMIT_MAX;
    process.env.RATE_LIMIT_RELAXED_CAPS = previousEnvironment.RATE_LIMIT_RELAXED_CAPS;
    vi.resetModules();
  });

  function injectWithBogusApiKey({ url, remoteAddress }: { url: string; remoteAddress: string }) {
    return application.inject({
      method: 'GET',
      url,
      remoteAddress,
      headers: { 'x-api-key': `ak_${randomInt(0, 0xffffff).toString(16)}bogus` },
    });
  }

  it('meters a bogus X-Api-Key 401 with the global limit, then answers 429', async () => {
    const remoteAddress = freshIpv4Address();
    for (let attempt = 1; attempt <= GLOBAL_MAX; attempt += 1) {
      const response = await injectWithBogusApiKey({ url: '/protected', remoteAddress });
      expect(response.statusCode).toBe(401);
      expect(response.headers['x-ratelimit-limit']).toBe(String(GLOBAL_MAX));
      expect(response.headers['x-ratelimit-remaining']).toBe(String(GLOBAL_MAX - attempt));
    }
    const throttled = await injectWithBogusApiKey({ url: '/protected', remoteAddress });
    expect(throttled.statusCode).toBe(429);
    expect(throttled.json().error.code).toBe('rate_limited');
    expect(throttled.headers['retry-after']).toBeDefined();
  });

  it('meters unknown URLs, then answers 429', async () => {
    const remoteAddress = freshIpv4Address();
    for (let attempt = 1; attempt <= GLOBAL_MAX; attempt += 1) {
      const response = await application.inject({
        method: 'GET',
        url: `/no-such-route-${attempt}`,
        remoteAddress,
      });
      expect(response.statusCode).toBe(404);
      expect(response.headers['x-ratelimit-limit']).toBe(String(GLOBAL_MAX));
      expect(response.headers['x-ratelimit-remaining']).toBe(String(GLOBAL_MAX - attempt));
    }
    const throttled = await application.inject({ method: 'GET', url: '/nope', remoteAddress });
    expect(throttled.statusCode).toBe(429);
  });

  it('meters failed authentication on a route with its own preset, and stops the key lookups', async () => {
    const remoteAddress = freshIpv4Address();
    apiKeyAuthenticate.mockClear();
    for (let attempt = 1; attempt <= FAILED_AUTHENTICATION_MAX; attempt += 1) {
      const response = await injectWithBogusApiKey({ url: '/preset', remoteAddress });
      expect(response.statusCode).toBe(401);
      expect(response.headers['x-ratelimit-limit']).toBe(String(FAILED_AUTHENTICATION_MAX));
      expect(response.headers['x-ratelimit-remaining']).toBe(
        String(FAILED_AUTHENTICATION_MAX - attempt),
      );
    }
    expect(apiKeyAuthenticate).toHaveBeenCalledTimes(FAILED_AUTHENTICATION_MAX);

    const throttled = await injectWithBogusApiKey({ url: '/preset', remoteAddress });
    expect(throttled.statusCode).toBe(429);
    expect(throttled.json().error.code).toBe('rate_limited');
    expect(Number(throttled.headers['retry-after'])).toBeGreaterThan(0);
    // Refused before any credential check: no further database lookup.
    expect(apiKeyAuthenticate).toHaveBeenCalledTimes(FAILED_AUTHENTICATION_MAX);
  });

  it('does not count a request that presents no credential', async () => {
    const remoteAddress = freshIpv4Address();
    for (let attempt = 0; attempt < FAILED_AUTHENTICATION_MAX + 5; attempt += 1) {
      const response = await application.inject({ method: 'GET', url: '/preset', remoteAddress });
      expect(response.statusCode).toBe(401);
    }
    const credentialed = await injectWithBogusApiKey({ url: '/preset', remoteAddress });
    expect(credentialed.statusCode).toBe(401);
    expect(credentialed.headers['x-ratelimit-remaining']).toBe(
      String(FAILED_AUTHENTICATION_MAX - 1),
    );
  });

  it('shares one bucket across an IPv6 /64 (D-3)', async () => {
    const prefix = freshIpv6Prefix();
    for (let attempt = 1; attempt <= GLOBAL_MAX; attempt += 1) {
      const response = await application.inject({
        method: 'GET',
        url: '/no-such-route',
        remoteAddress: `${prefix}::${attempt.toString(16)}`,
      });
      expect(response.statusCode).toBe(404);
    }
    const throttled = await application.inject({
      method: 'GET',
      url: '/no-such-route',
      remoteAddress: `${prefix}:ffff:ffff:ffff:ffff`,
    });
    expect(throttled.statusCode).toBe(429);
  });
});
