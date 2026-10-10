import { describe, expect, it, vi } from 'vitest';

/** Cloudflare's published Turnstile test secrets: one always passes, one always fails. */
const ALWAYS_PASSES_SECRET = '1x0000000000000000000000000000000AA';
const ALWAYS_FAILS_SECRET = '2x0000000000000000000000000000000AA';

const turnstileEnvironment = vi.hoisted(() => ({ secret: '' }));
vi.mock('@/shared/config/env.config.js', async () => {
  const actual = await vi.importActual<typeof import('@/shared/config/env.config.js')>(
    '@/shared/config/env.config.js',
  );
  const withSecret = () => ({
    ...actual.env,
    CAPTCHA_PROVIDER: 'turnstile' as const,
    CAPTCHA_SECRET: turnstileEnvironment.secret,
  });
  return {
    ...actual,
    get env() {
      return withSecret();
    },
    getEnv: withSecret,
  };
});

import { verifyTurnstileToken } from '@/shared/utils/security/turnstile-verifier.util.js';
import { registerThirdPartyContractTestIsolationHooks } from './helpers/register-contract-test-hooks.js';

registerThirdPartyContractTestIsolationHooks();

/**
 * Live check against Cloudflare siteverify (`pnpm test:contract:live`) with Cloudflare's own test
 * secrets — no account key involved: our verifier reads a pass and a refusal correctly.
 */
describe('Cloudflare Turnstile siteverify (live)', () => {
  it('accepts a token under the always-pass test secret', async () => {
    turnstileEnvironment.secret = ALWAYS_PASSES_SECRET;
    expect(await verifyTurnstileToken({ token: 'XXXX.DUMMY.TOKEN.XXXX' })).toMatchObject({
      success: true,
    });
  });

  it('refuses a token under the always-fail test secret', async () => {
    turnstileEnvironment.secret = ALWAYS_FAILS_SECRET;
    expect(await verifyTurnstileToken({ token: 'XXXX.DUMMY.TOKEN.XXXX' })).toEqual({
      success: false,
      errorCodes: ['invalid-input-response'],
    });
  });
});
