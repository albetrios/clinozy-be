import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { STRICT_PUBLIC_PER_EMAIL_RATE_LIMIT_OPTIONS } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { refuseRateLimitedRequest } from '@/shared/middlewares/rate-limit/rate-limit-refusal.js';

/**
 * Builds the per-email `preHandler` for the public credential and outbound-email routes (login,
 * send-code, forgot-password, passkey options): 5 requests per 15 minutes per normalized email in
 * production, whatever address they come from.
 *
 * @remarks
 * - **Algorithm:** a standalone limiter from `app.createRateLimit(STRICT_PUBLIC_PER_EMAIL_RATE_LIMIT_OPTIONS)`
 *   — one shared store bucket per email hash — counts every request; over the budget → 429.
 * - **Failure modes:** throws `RateLimitedError` (429) with `Retry-After` and `X-RateLimit-*`.
 * - **Side effects:** one counter increment per request.
 * - **Notes:** the out-of-scope finding from the BE-1 batch — the route's IP limit
 *   (`STRICT_PUBLIC_RATE_LIMIT`, `onRequest`) and an `app.rateLimit()` preHandler share
 *   `@fastify/rate-limit`'s per-request "already ran" flag, so the per-email hook returned without
 *   counting (a probe with a per-email max of 2 got five 200s). A `createRateLimit` limiter has no
 *   such flag, so the two budgets apply independently.
 */
export function createPerEmailRateLimitPreHandler(
  app: FastifyInstance,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const rateLimit = app.createRateLimit(STRICT_PUBLIC_PER_EMAIL_RATE_LIMIT_OPTIONS);
  return async function perEmailRateLimitPreHandler(request, reply): Promise<void> {
    const state = await rateLimit(request);
    if (state.isAllowed || !state.isExceeded) return;
    refuseRateLimitedRequest({ request, reply, state });
  };
}
