import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { RateLimitedError } from '@/shared/errors/index.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { shouldEmitRateLimitTelemetry } from '@/shared/middlewares/rate-limit/rate-limit-telemetry-throttle.js';

/** A limiter `app.createRateLimit(...)` returns — called per request, it never short-circuits. */
export type StandaloneRateLimit = ReturnType<FastifyInstance['createRateLimit']>;

/** The state a {@link StandaloneRateLimit} reports for a key it counted (not allow-listed). */
export type CountedRateLimitState = Extract<
  Awaited<ReturnType<StandaloneRateLimit>>,
  { isAllowed: false }
>;

/**
 * Writes `X-RateLimit-Limit` / `-Remaining` / `-Reset` for a standalone limiter's bucket.
 *
 * @remarks
 * Shared by the failed-authentication and per-email limiters, which run outside
 * `@fastify/rate-limit`'s own hook and so set the headers themselves.
 */
export function setRateLimitHeaders({
  reply,
  state,
  remaining,
}: {
  reply: FastifyReply;
  state: CountedRateLimitState;
  remaining: number;
}): void {
  reply.header('x-ratelimit-limit', state.max);
  reply.header('x-ratelimit-remaining', remaining);
  reply.header('x-ratelimit-reset', state.ttlInSeconds);
}

/**
 * Refuses a request whose standalone-limiter bucket is spent: a throttled `rate_limit.exceeded`
 * warning, the `X-RateLimit-*` headers, and a 429 with `Retry-After` = the window's remaining seconds.
 *
 * @remarks
 * - **Failure modes:** always throws `RateLimitedError` (429).
 * - **Side effects:** one structured warning (throttled per key — the key is already an opaque
 *   hash or address bucket, never a raw email) and three response headers.
 */
export function refuseRateLimitedRequest({
  request,
  reply,
  state,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  state: CountedRateLimitState;
}): never {
  if (shouldEmitRateLimitTelemetry(state.key)) {
    logger.warn({
      event: 'rate_limit.exceeded',
      ip: request.ip,
      method: request.method,
      url: request.routeOptions?.url ?? request.url,
      key: state.key,
    });
  }
  setRateLimitHeaders({ reply, state, remaining: 0 });
  throw new RateLimitedError().withRetryAfter(Math.max(1, state.ttlInSeconds));
}
