import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CreateRateLimitOptions } from '@fastify/rate-limit';
import { env } from '@/shared/config/env.config.js';
import { MILLISECONDS_PER_MINUTE } from '@/shared/constants/ttl.constants.js';
import { rateLimitIpKey } from '@/shared/utils/http/rate-limit-ip-key.util.js';
import {
  refuseRateLimitedRequest,
  setRateLimitHeaders,
  type StandaloneRateLimit,
} from '@/shared/middlewares/rate-limit/rate-limit-refusal.js';

/**
 * Failed authentications one client address may make per {@link FAILED_AUTHENTICATION_WINDOW_MS}
 * (60 in production). Lifted to 5000 when `RATE_LIMIT_RELAXED_CAPS` is set (development and test),
 * like the presets, so loopback suites that send many bad tokens from one address stay green.
 */
const FAILED_AUTHENTICATION_MAX_PER_WINDOW = env.RATE_LIMIT_RELAXED_CAPS ? 5000 : 60;

/** The failed-authentication window: one minute. */
const FAILED_AUTHENTICATION_WINDOW_MS = MILLISECONDS_PER_MINUTE;

/**
 * Options for the failed-authentication limiter `app.createRateLimit(...)` builds in the
 * rate-limit middleware — per client address (IPv6 /64), one bucket for every protected route.
 */
export const FAILED_AUTHENTICATION_RATE_LIMIT_OPTIONS: CreateRateLimitOptions = {
  max: FAILED_AUTHENTICATION_MAX_PER_WINDOW,
  timeWindow: FAILED_AUTHENTICATION_WINDOW_MS,
  keyGenerator: (request) => `failed-authentication:${rateLimitIpKey(request.ip)}`,
};

/** The limiter `app.createRateLimit(FAILED_AUTHENTICATION_RATE_LIMIT_OPTIONS)` returns. */
export type FailedAuthenticationRateLimit = StandaloneRateLimit;

/** Inputs shared by {@link refuseWhenFailedAuthenticationBudgetSpent} and {@link recordFailedAuthentication}. */
interface FailedAuthenticationBudgetOptions {
  request: FastifyRequest;
  reply: FastifyReply;
  rateLimit: FailedAuthenticationRateLimit;
}

/**
 * True when the request carries a credential to check — an `Authorization` header or an
 * `X-Api-Key`. A request that sends none is not an authentication attempt and is never counted.
 */
export function requestPresentsCredential(request: FastifyRequest): boolean {
  return request.headers.authorization !== undefined || request.headers['x-api-key'] !== undefined;
}

/**
 * Refuses a credentialed request with 429 before any credential check once its client address
 * has spent the failed-authentication budget.
 *
 * @remarks
 * - **Algorithm:** a non-incrementing read of the address's bucket
 *   (`rateLimit(request, { increment: false })`); no budget left → 429.
 * - **Failure modes:** throws `RateLimitedError` (429) with `Retry-After` = the window's remaining
 *   seconds and `X-RateLimit-*`; a store error never throws (the store falls over in-process).
 * - **Side effects:** response headers on the refusal only.
 * - **Notes:** D-2 — run before the API-key prefix lookup and the session check, so a caller
 *   guessing keys or replaying revoked tokens stops costing a database round trip once over
 *   budget. Valid credentials from that address are refused too until the window resets, as the
 *   per-IP failed-login throttle on `POST /auth/login` does.
 */
export async function refuseWhenFailedAuthenticationBudgetSpent({
  request,
  reply,
  rateLimit,
}: FailedAuthenticationBudgetOptions): Promise<void> {
  const state = await rateLimit(request, { increment: false });
  if (state.isAllowed || state.remaining > 0) return;
  refuseRateLimitedRequest({ request, reply, state });
}

/**
 * Counts one failed authentication against the client address and labels the 401 with the budget.
 *
 * @remarks
 * - **Algorithm:** increments the address's bucket; over the budget (two concurrent failures
 *   racing past the last slot) → 429, otherwise the caller rethrows its 401.
 * - **Failure modes:** throws `RateLimitedError` (429) when the increment overshoots the budget.
 * - **Side effects:** one counter increment; `X-RateLimit-*` headers on the reply unless an
 *   earlier limiter (the global one) already set them.
 * - **Notes:** D-2 — on a route with its own preset the global limiter does not run, so these
 *   headers are the only ones a failed authentication there carries.
 */
export async function recordFailedAuthentication({
  request,
  reply,
  rateLimit,
}: FailedAuthenticationBudgetOptions): Promise<void> {
  const state = await rateLimit(request);
  if (state.isAllowed) return;
  if (state.isExceeded) refuseRateLimitedRequest({ request, reply, state });
  if (!reply.hasHeader('x-ratelimit-limit')) {
    setRateLimitHeaders({ reply, state, remaining: state.remaining });
  }
}
