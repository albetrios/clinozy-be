import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { RateLimitedError } from '@/shared/errors/auth.error.js';
import { STRICT_PUBLIC_PER_EMAIL_RATE_LIMIT_OPTIONS } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';

/**
 * Per-email throttle that still runs after the route's per-IP limiter.
 *
 * `app.rateLimit()` returns a hook that no-ops once `rateLimitRan` is set, and the route's
 * `config.rateLimit` hook sets that marker first. `createRateLimit` counts without reading the
 * marker, so this preHandler is the one that actually enforces the email bucket.
 *
 * @remarks
 * Call it only after the rate-limit plugin is registered (`app.createRateLimit` is its decorator).
 * The hook runs at `preHandler`, after the body is parsed, because the bucket key is the email in
 * the body. A rejection throws {@link RateLimitedError} with `Retry-After` and reports the same
 * `onExceeded` observer as the other presets.
 */
export function createPerEmailRateLimitPreHandler(
  app: FastifyInstance,
): preHandlerAsyncHookHandler {
  const checkPerEmailRateLimit = app.createRateLimit(STRICT_PUBLIC_PER_EMAIL_RATE_LIMIT_OPTIONS);

  return async function enforcePerEmailRateLimit(request: FastifyRequest): Promise<void> {
    const result = await checkPerEmailRateLimit(request);
    if (result.isAllowed || !result.isExceeded) {
      return;
    }
    STRICT_PUBLIC_PER_EMAIL_RATE_LIMIT_OPTIONS.onExceeded?.(request, result.key);
    throw new RateLimitedError().withRetryAfter(Math.max(1, result.ttlInSeconds));
  };
}
