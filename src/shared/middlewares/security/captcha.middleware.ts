import type { FastifyReply, FastifyRequest } from 'fastify';
import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';
import { captureMessage } from '@/infrastructure/observability/sentry/sentry.js';
import { getEnv } from '@/shared/config/env.config.js';
import { ServiceUnavailableError, UnauthorizedError } from '@/shared/errors/index.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  type TurnstileVerifyResult,
  verifyTurnstileToken,
} from '@/shared/utils/security/turnstile-verifier.util.js';

/** Throttle window for outage-class Sentry alerts so a sustained Turnstile outage cannot flood Sentry. */
const CAPTCHA_PROVIDER_UNAVAILABLE_ALERT_INTERVAL_MS = 30_000;
let lastCaptchaProviderUnavailableAlertAtMs = 0;

/** Outage-class reasons the captcha pre-handler surfaces to Sentry (turnstile path only). */
type CaptchaUnavailableReason = 'breaker_open' | 'verify_error';

/**
 * Surfaces the captcha provider (Cloudflare Turnstile) being unavailable as a throttled Sentry event.
 *
 * @remarks
 * sec-C/M finding #16: the 30-second throttle is for outage-class signals (`breaker_open`,
 * `verify_error`) — a Turnstile outage that floods Sentry once per minute is preferable to one
 * event per request. Misconfiguration cannot reach here: the always-on env-schema refine requires
 * `CAPTCHA_SECRET` whenever `CAPTCHA_PROVIDER=turnstile`, so a secret-less turnstile fails at boot.
 */
function alertCaptchaProviderUnavailable(reason: CaptchaUnavailableReason): void {
  const now = Date.now();
  if (
    now - lastCaptchaProviderUnavailableAlertAtMs <
    CAPTCHA_PROVIDER_UNAVAILABLE_ALERT_INTERVAL_MS
  ) {
    return;
  }
  lastCaptchaProviderUnavailableAlertAtMs = now;
  captureMessage({
    message: 'captcha.provider_unavailable',
    options: { level: 'error', extra: { reason } },
  });
}

function firstHeaderValue(rawHeader: string | string[] | undefined): string | undefined {
  if (rawHeader === undefined || rawHeader === '') {
    return undefined;
  }
  const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isCaptchaFailOpen(): boolean {
  // Safety valve for the TURNSTILE path: when CAPTCHA_PROVIDER=turnstile but Cloudflare cannot
  // answer (an outage or an open circuit), fail OPEN (skip) vs CLOSED (503, the hardened default).
  // It is NOT a co-flag for turning captcha off — `CAPTCHA_PROVIDER=disabled` does that on its own.
  // The env-schema refine rejects it in production, so this valve is local/development only.
  return getEnv().CAPTCHA_FAIL_OPEN;
}

/** Whole seconds until an open circuit lets a call through again, for `Retry-After`. */
function retryAfterSecondsFor(error: unknown): number | undefined {
  if (
    error instanceof ExternalServiceError &&
    error.category === 'circuit_open' &&
    error.retryAfterMs !== undefined
  ) {
    return Math.max(1, Math.ceil(error.retryAfterMs / 1000));
  }
  return undefined;
}

function isCaptchaBypassAllowed(request: FastifyRequest): boolean {
  const environment = getEnv();
  // sec-M3: bypass is a dev/test affordance only. CAPTCHA_BYPASS_ALLOWED defaults false on any
  // deployed runtime and the env-schema refine rejects `true` in production, so a DNS
  // misconfig / blue-green slot mix-up cannot collapse credential-stuffing protection.
  if (!environment.CAPTCHA_BYPASS_ALLOWED) {
    return false;
  }
  const bypassHeaderName = environment.CAPTCHA_BYPASS_HEADER;
  if (!bypassHeaderName) {
    return false;
  }
  const bypassValue = firstHeaderValue(
    request.headers[bypassHeaderName.toLowerCase() as keyof typeof request.headers],
  );
  return bypassValue === 'true' || bypassValue === '1';
}

/**
 * Validates the Cloudflare Turnstile token from `X-Captcha-Token` on public auth routes.
 * `CAPTCHA_PROVIDER=disabled` skips unconditionally (off is off — one flag, no co-flag). A token
 * Cloudflare refuses is a 401; Cloudflare failing (or its circuit open) is a 503 with
 * `Retry-After` when known — or, with `CAPTCHA_FAIL_OPEN` (never in production), a skipped check.
 * Production always enforces (the env-schema refine requires turnstile + secret there).
 */
export async function captchaPreHandler(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const environment = getEnv();

  // `disabled` is an explicit operator choice to run WITHOUT captcha — one flag, one behaviour (no
  // CAPTCHA_FAIL_OPEN co-flag). Never reachable in production: the env-schema refine requires
  // CAPTCHA_PROVIDER=turnstile + CAPTCHA_SECRET there, so this early return only skips in
  // dev / local / self-hosted.
  if (environment.CAPTCHA_PROVIDER === 'disabled') {
    return;
  }

  // provider === 'turnstile' AND CAPTCHA_SECRET is set — both guaranteed at boot by the always-on
  // env-schema refine (`turnstile` ⟹ secret). Enforce the token.
  if (isCaptchaBypassAllowed(request)) {
    return;
  }

  const captchaToken = firstHeaderValue(request.headers['x-captcha-token']);
  if (!captchaToken) {
    throw new UnauthorizedError('errors:captchaRequired');
  }

  let result: TurnstileVerifyResult;
  try {
    result = await verifyTurnstileToken({
      token: captchaToken,
      remoteIp: request.ip,
      requestId: request.id,
    });
  } catch (error) {
    const retryAfterSeconds = retryAfterSecondsFor(error);
    alertCaptchaProviderUnavailable(
      retryAfterSeconds === undefined ? 'verify_error' : 'breaker_open',
    );
    if (isCaptchaFailOpen()) {
      logger.warn({ requestId: request.id }, 'captcha.provider_unavailable.fail_open');
      return;
    }
    // The client did nothing wrong: 503 says "try again", where a 401 would say "bad captcha".
    const unavailable = new ServiceUnavailableError('errors:captchaProviderUnavailable');
    throw retryAfterSeconds === undefined
      ? unavailable
      : unavailable.withRetryAfter(retryAfterSeconds);
  }
  if (!result.success) {
    throw new UnauthorizedError('errors:captchaInvalid');
  }
}
