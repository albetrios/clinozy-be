import { buildOutboundFetchOptions, outboundFetchJson } from '@/infrastructure/outbound/index.js';
import { getEnv } from '@/shared/config/env.config.js';
import { TURNSTILE_TEST_SECRET_PATTERN } from '@/shared/constants/security.constants.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { parseAllowedOriginsList } from '@/shared/utils/security/allowed-origins.util.js';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Result from {@link verifyTurnstileToken}: `success` plus any error codes Cloudflare returned. */
export type TurnstileVerifyResult = {
  success: boolean;
  errorCodes?: string[];
};

type TurnstileSiteVerifyResponse = {
  success?: boolean;
  'error-codes'?: string[];
  // audit #20: `hostname` is the page that solved the challenge; `action` is the widget action.
  hostname?: string;
  action?: string;
};

/**
 * Returns the set of hostnames Turnstile tokens are permitted to be solved on (derived from
 * `ALLOWED_ORIGINS`), or `null` when none are configured (no hostname assertion possible).
 */
function resolveAllowedTurnstileHostnames(): Set<string> | null {
  const origins = parseAllowedOriginsList(getEnv().ALLOWED_ORIGINS);
  const hostnames = new Set<string>();
  for (const origin of origins) {
    try {
      hostnames.add(new URL(origin).hostname.toLowerCase());
    } catch {
      // ignore non-absolute origins (none in deployed runtimes; schema enforces https there)
    }
  }
  return hostnames.size > 0 ? hostnames : null;
}

/** Inputs for {@link verifyTurnstileToken}; `remoteIp` is optional but recommended for Cloudflare's risk scoring. */
export interface VerifyTurnstileTokenOptions {
  token: string;
  remoteIp?: string;
  requestId?: string;
}

/**
 * Verifies a Cloudflare Turnstile token via the siteverify API.
 *
 * @remarks
 * - **Algorithm:** POSTs the token (and the client IP) to siteverify through the
 *   `captcha-turnstile` integration (timeout + circuit) and reads the JSON verdict. A token solved
 *   on a host outside `ALLOWED_ORIGINS` is refused (`hostname-mismatch`, audit #20) unless the
 *   secret is a Cloudflare test secret.
 * - **Failure modes:** Cloudflare refusing the token is a result (`success: false`). Cloudflare
 *   failing — network, timeout, a status other than 200, a body that is not JSON, an open circuit
 *   (`category: 'circuit_open'`, with `retryAfterMs`) — throws `ExternalServiceError`; the captcha
 *   pre-handler answers 503 for it. A missing `CAPTCHA_SECRET` throws (the env schema requires it
 *   with `turnstile`).
 * - **Side effects:** one HTTP request; logs a hostname mismatch.
 * - **Notes:** Turnstile tokens are single-use — never retried.
 */
export async function verifyTurnstileToken(
  options: VerifyTurnstileTokenOptions,
): Promise<TurnstileVerifyResult> {
  const secret = getEnv().CAPTCHA_SECRET;
  if (!secret) {
    throw new Error('CAPTCHA_SECRET is not configured');
  }

  const body = new URLSearchParams({
    secret,
    response: options.token,
  });
  if (options.remoteIp) {
    body.set('remoteip', options.remoteIp);
  }

  const payload = await outboundFetchJson<TurnstileSiteVerifyResponse>(
    buildOutboundFetchOptions({
      name: 'captcha-turnstile',
      url: TURNSTILE_VERIFY_URL,
      requestId: options.requestId,
      expectedStatus: 200,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    }),
  );

  const result: TurnstileVerifyResult = { success: payload.success === true };
  const errorCodes = payload['error-codes'];
  if (errorCodes !== undefined) {
    result.errorCodes = errorCodes;
  }
  // audit #20: a token solved on another property (or a `*`-hostname widget) must not be
  // replayable against our backend. When Cloudflare returns the solving `hostname` and we have an
  // allowlist (from ALLOWED_ORIGINS), reject a mismatch — defense-in-depth on top of the per-IP +
  // per-email rate limits. Not for a Cloudflare test secret: its results always say `example.com`
  // and every token passes anyway (local CAPTCHA); production refuses it.
  if (
    result.success &&
    typeof payload.hostname === 'string' &&
    !TURNSTILE_TEST_SECRET_PATTERN.test(secret)
  ) {
    const allowedHostnames = resolveAllowedTurnstileHostnames();
    if (allowedHostnames !== null && !allowedHostnames.has(payload.hostname.toLowerCase())) {
      logger.warn(
        { hostname: payload.hostname, action: payload.action },
        'turnstile.hostname.mismatch',
      );
      return { success: false, errorCodes: ['hostname-mismatch'] };
    }
  }
  return result;
}
