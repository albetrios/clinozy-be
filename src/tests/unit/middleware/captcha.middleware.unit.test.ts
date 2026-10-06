import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { resetEnvCacheForTests } from '@/shared/config/env.config.js';
import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';
import { ServiceUnavailableError, UnauthorizedError } from '@/shared/errors/index.js';
import { captchaPreHandler } from '@/shared/middlewares/security/captcha.middleware.js';

const verifyTurnstileTokenMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/utils/security/turnstile-verifier.util.js', () => ({
  verifyTurnstileToken: verifyTurnstileTokenMock,
}));

function buildRequest(headers: Record<string, string> = {}): FastifyRequest {
  return {
    headers,
    ip: '127.0.0.1',
    id: 'req-1',
  } as FastifyRequest;
}

describe('captchaPreHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'development';
    process.env.CAPTCHA_PROVIDER = 'disabled';
    delete process.env.CAPTCHA_SECRET;
    resetEnvCacheForTests();
  });

  afterEach(() => {
    delete process.env.CAPTCHA_SECRET;
    delete process.env.CAPTCHA_BYPASS_HEADER;
    // Restore the harness defaults (src/tests/setup.ts) so a per-test override cannot leak into
    // sibling tests / files sharing this Vitest worker's process.env.
    process.env.CAPTCHA_PROVIDER = 'disabled';
    process.env.CAPTCHA_FAIL_OPEN = 'true';
    resetEnvCacheForTests();
  });

  it('skips unconditionally when CAPTCHA_PROVIDER=disabled', async () => {
    await expect(captchaPreHandler(buildRequest(), {} as FastifyReply)).resolves.toBeUndefined();
    expect(verifyTurnstileTokenMock).not.toHaveBeenCalled();
  });

  it('CAPTCHA_PROVIDER=disabled skips even when CAPTCHA_FAIL_OPEN=false (one flag, one behaviour)', async () => {
    // Regression: turning captcha off must NOT require a second flag. Before the fix, `disabled`
    // fell into the fail-open/closed branch and threw "captchaProviderUnavailable" with fail-open
    // false — so operators needed both CAPTCHA_PROVIDER=disabled AND CAPTCHA_FAIL_OPEN=true.
    process.env.CAPTCHA_FAIL_OPEN = 'false';
    resetEnvCacheForTests();

    await expect(captchaPreHandler(buildRequest(), {} as FastifyReply)).resolves.toBeUndefined();
    expect(verifyTurnstileTokenMock).not.toHaveBeenCalled();
  });

  it('throws captchaRequired when the token is missing and turnstile is enabled', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.CAPTCHA_SECRET = 'secret';
    resetEnvCacheForTests();

    await expect(captchaPreHandler(buildRequest(), {} as FastifyReply)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('accepts a valid token when turnstile is enabled', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.CAPTCHA_SECRET = 'secret';
    resetEnvCacheForTests();
    verifyTurnstileTokenMock.mockResolvedValue({ success: true });

    await expect(
      captchaPreHandler(buildRequest({ 'x-captcha-token': 'tok' }), {} as FastifyReply),
    ).resolves.toBeUndefined();
    expect(verifyTurnstileTokenMock).toHaveBeenCalledWith({
      token: 'tok',
      remoteIp: '127.0.0.1',
      requestId: 'req-1',
    });
  });

  it('refuses a token Cloudflare rejects with captchaInvalid (401)', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.CAPTCHA_SECRET = 'secret';
    resetEnvCacheForTests();
    verifyTurnstileTokenMock.mockResolvedValue({ success: false });

    await expect(
      captchaPreHandler(buildRequest({ 'x-captcha-token': 'tok' }), {} as FastifyReply),
    ).rejects.toMatchObject({ statusCode: 401, messageKey: 'errors:captchaInvalid' });
  });

  it('turnstile outage fails CLOSED with a 503 when CAPTCHA_FAIL_OPEN=false — not a "bad captcha" 401', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.CAPTCHA_SECRET = 'secret';
    process.env.CAPTCHA_FAIL_OPEN = 'false';
    resetEnvCacheForTests();
    verifyTurnstileTokenMock.mockRejectedValue(
      new ExternalServiceError({ integration: 'captcha-turnstile', category: 'network' }),
    );

    const error = await captchaPreHandler(
      buildRequest({ 'x-captcha-token': 'tok' }),
      {} as FastifyReply,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error).toMatchObject({
      statusCode: 503,
      messageKey: 'errors:captchaProviderUnavailable',
    });
    expect((error as ServiceUnavailableError).retryAfterSeconds).toBeUndefined();
  });

  it('an open Turnstile circuit answers 503 with Retry-After when CAPTCHA_FAIL_OPEN=false', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.CAPTCHA_SECRET = 'secret';
    process.env.CAPTCHA_FAIL_OPEN = 'false';
    resetEnvCacheForTests();
    verifyTurnstileTokenMock.mockRejectedValue(
      new ExternalServiceError({
        integration: 'captcha-turnstile',
        category: 'circuit_open',
        retryAfterMs: 12_300,
      }),
    );

    await expect(
      captchaPreHandler(buildRequest({ 'x-captcha-token': 'tok' }), {} as FastifyReply),
    ).rejects.toMatchObject({
      statusCode: 503,
      messageKey: 'errors:captchaProviderUnavailable',
      retryAfterSeconds: 13,
    });
  });

  it('turnstile outage fails OPEN (skips) when CAPTCHA_FAIL_OPEN=true', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.CAPTCHA_SECRET = 'secret';
    process.env.CAPTCHA_FAIL_OPEN = 'true';
    resetEnvCacheForTests();
    verifyTurnstileTokenMock.mockRejectedValue(
      new ExternalServiceError({ integration: 'captcha-turnstile', category: 'timeout' }),
    );

    await expect(
      captchaPreHandler(buildRequest({ 'x-captcha-token': 'tok' }), {} as FastifyReply),
    ).resolves.toBeUndefined();
  });

  it('an open Turnstile circuit honours CAPTCHA_FAIL_OPEN=true too — it is the same outage', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.CAPTCHA_SECRET = 'secret';
    process.env.CAPTCHA_FAIL_OPEN = 'true';
    resetEnvCacheForTests();
    verifyTurnstileTokenMock.mockRejectedValue(
      new ExternalServiceError({
        integration: 'captcha-turnstile',
        category: 'circuit_open',
        retryAfterMs: 5_000,
      }),
    );

    await expect(
      captchaPreHandler(buildRequest({ 'x-captcha-token': 'tok' }), {} as FastifyReply),
    ).resolves.toBeUndefined();
  });
});
