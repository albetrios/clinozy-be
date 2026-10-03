import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { resetEnvCacheForTests } from '@/shared/config/env.config.js';
import { verifyTurnstileToken } from '@/shared/utils/security/turnstile-verifier.util.js';
import { TURNSTILE_ALWAYS_PASS_TEST_SECRET } from '@/shared/constants/security.constants.js';

const TURNSTILE_HOST = 'https://challenges.cloudflare.com';

describe('verifyTurnstileToken', () => {
  beforeEach(() => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.CAPTCHA_SECRET = 'test-secret-key';
    resetEnvCacheForTests();
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env.CAPTCHA_PROVIDER;
    delete process.env.CAPTCHA_SECRET;
    resetEnvCacheForTests();
  });

  it('returns success when Turnstile siteverify succeeds', async () => {
    nock(TURNSTILE_HOST).post('/turnstile/v0/siteverify').reply(200, { success: true });

    const result = await verifyTurnstileToken({ token: 'valid-token', remoteIp: '127.0.0.1' });
    expect(result.success).toBe(true);
  });

  it('returns failure when Turnstile rejects token', async () => {
    nock(TURNSTILE_HOST)
      .post('/turnstile/v0/siteverify')
      .reply(200, { success: false, 'error-codes': ['invalid-input-response'] });

    const result = await verifyTurnstileToken({ token: 'bad-token' });
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('invalid-input-response');
  });

  // Cloudflare's test-secret responses always name `example.com` (verbatim shape below).
  const TEST_KEY_RESPONSE = {
    success: true,
    hostname: 'example.com',
    'error-codes': [],
    metadata: { result_with_testing_key: true },
  };

  it('pins the solving hostname for a real secret (audit #20): example.com is refused', async () => {
    nock(TURNSTILE_HOST).post('/turnstile/v0/siteverify').reply(200, TEST_KEY_RESPONSE);

    const result = await verifyTurnstileToken({ token: 'token' });
    expect(result).toEqual({ success: false, errorCodes: ['hostname-mismatch'] });
  });

  it('skips the pin for a Cloudflare test secret, so local CAPTCHA (test keys) passes', async () => {
    process.env.CAPTCHA_SECRET = TURNSTILE_ALWAYS_PASS_TEST_SECRET;
    resetEnvCacheForTests();
    nock(TURNSTILE_HOST).post('/turnstile/v0/siteverify').reply(200, TEST_KEY_RESPONSE);

    const result = await verifyTurnstileToken({ token: 'XXXX.DUMMY.TOKEN.XXXX' });
    expect(result.success).toBe(true);
  });
});
