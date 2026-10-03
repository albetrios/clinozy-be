import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';
import { formatEnvValue, upsertEnvAssignment } from '@tooling/dev/env-file.util.js';
import { applyLocalCaptcha } from '@tooling/dev/local-captcha.js';
import { TURNSTILE_ALWAYS_PASS_TEST_SECRET } from '@/shared/constants/security.constants.js';

const TEMPLATE = [
  'CAPTCHA_SECRET=',
  'CAPTCHA_PROVIDER=disabled',
  'CAPTCHA_BYPASS_HEADER=X-Captcha-Bypass',
  'LOG_LEVEL=debug',
  '',
].join('\n');

describe('setup:local --with-captcha / --without-captcha', () => {
  it('turns Turnstile on with the always-pass test secret and allows the dev bypass', () => {
    const values = dotenv.parse(applyLocalCaptcha(TEMPLATE, true));
    expect(values).toMatchObject({
      CAPTCHA_PROVIDER: 'turnstile',
      CAPTCHA_SECRET: TURNSTILE_ALWAYS_PASS_TEST_SECRET,
      CAPTCHA_BYPASS_ALLOWED: 'true',
      CAPTCHA_BYPASS_HEADER: 'X-Captcha-Bypass',
      LOG_LEVEL: 'debug',
    });
  });

  it('keeps a CAPTCHA secret the developer already set', () => {
    const own = TEMPLATE.replace('CAPTCHA_SECRET=', 'CAPTCHA_SECRET=my-own-turnstile-secret');
    expect(dotenv.parse(applyLocalCaptcha(own, true)).CAPTCHA_SECRET).toBe(
      'my-own-turnstile-secret',
    );
  });

  it('turns it back off without touching anything else, and repeats cleanly', () => {
    const on = applyLocalCaptcha(TEMPLATE, true);
    const off = applyLocalCaptcha(on, false);
    expect(dotenv.parse(off).CAPTCHA_PROVIDER).toBe('disabled');
    expect(off.replace('CAPTCHA_PROVIDER=disabled', 'CAPTCHA_PROVIDER=turnstile')).toBe(on);
    expect(applyLocalCaptcha(on, true)).toBe(on);
  });
});

describe('env-file editing (setup:local)', () => {
  it('replaces an existing assignment and appends a missing one', () => {
    const updated = upsertEnvAssignment(upsertEnvAssignment('A=1\nB=2\n', 'A', '9'), 'C', '3');
    expect(updated).toBe('A=9\nB=2\nC=3\n');
  });

  it('writes a `$` in a value literally (never as a replacement pattern)', () => {
    const updated = upsertEnvAssignment('SECRET=old\n', 'SECRET', 'pa$&ss$1');
    expect(updated).toBe('SECRET=pa$&ss$1\n');
  });

  it('quotes a value that is not a bare token so dotenv reads it back unchanged', () => {
    const values = [
      'plain-token_1.2',
      'Name <a@b.test>',
      'with space',
      'has"quote',
      "it's",
      '-----BEGIN KEY-----\nline two\n-----END KEY-----',
    ];
    for (const value of values) {
      const parsed = dotenv.parse(upsertEnvAssignment('', 'KEY', formatEnvValue(value)));
      expect(parsed.KEY).toBe(value);
    }
  });
});
