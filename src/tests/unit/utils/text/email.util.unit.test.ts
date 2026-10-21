import { describe, expect, it, vi } from 'vitest';
import { DISPOSABLE_EMAIL_MESSAGE, isReservedEmailDomain } from '@/shared/utils/text/email.util.js';

const DISPOSABLE_EMAIL = 'test@yopmail.com';
const NORMAL_EMAIL = 'user@example.com';

describe('email.util', () => {
  it('exports DISPOSABLE_EMAIL_MESSAGE', () => {
    expect(DISPOSABLE_EMAIL_MESSAGE).toBe(
      'Disposable or temporary email addresses are not allowed',
    );
  });

  describe('BLOCK_DISPOSABLE_EMAIL switch (default true)', () => {
    it('when BLOCK_DISPOSABLE_EMAIL is true (default), disposable email is blocked in any environment', async () => {
      vi.doMock('@/shared/config/env.config.js', () => ({
        getEnv: () => ({ BLOCK_DISPOSABLE_EMAIL: true }),
      }));
      await vi.resetModules();
      const mod = await import('@/shared/utils/text/email.util.js');
      expect(mod.isDisposableEmailBlocked(DISPOSABLE_EMAIL)).toBe(true);
      expect(mod.isDisposableEmailBlocked('user@mailinator.com')).toBe(true);
      expect(mod.isDisposableEmailBlocked(NORMAL_EMAIL)).toBe(false);
      expect(mod.isDisposableEmailBlocked('user@gmail.com')).toBe(false);
    });

    it('when BLOCK_DISPOSABLE_EMAIL is false, disposable email is allowed (check off)', async () => {
      vi.doMock('@/shared/config/env.config.js', () => ({
        getEnv: () => ({ BLOCK_DISPOSABLE_EMAIL: false }),
      }));
      await vi.resetModules();
      const mod = await import('@/shared/utils/text/email.util.js');
      expect(mod.isDisposableEmailBlocked(DISPOSABLE_EMAIL)).toBe(false);
      expect(mod.isDisposableEmailBlocked('user@mailinator.com')).toBe(false);
      expect(mod.isDisposableEmailBlocked(NORMAL_EMAIL)).toBe(false);
    });
  });

  describe('disposable domains', () => {
    it('blocks known disposable domains when switch is on', async () => {
      vi.doMock('@/shared/config/env.config.js', () => ({
        getEnv: () => ({ BLOCK_DISPOSABLE_EMAIL: true }),
      }));
      await vi.resetModules();
      const mod = await import('@/shared/utils/text/email.util.js');
      expect(mod.isDisposableEmailBlocked('test@yopmail.com')).toBe(true);
      expect(mod.isDisposableEmailBlocked('user@mailinator.com')).toBe(true);
    });

    it('allows normal domains when switch is on', async () => {
      vi.doMock('@/shared/config/env.config.js', () => ({
        getEnv: () => ({ BLOCK_DISPOSABLE_EMAIL: true }),
      }));
      await vi.resetModules();
      const mod = await import('@/shared/utils/text/email.util.js');
      expect(mod.isDisposableEmailBlocked('user@example.com')).toBe(false);
      expect(mod.isDisposableEmailBlocked('user@gmail.com')).toBe(false);
    });
  });

  describe('isReservedEmailDomain', () => {
    it('matches the documentation domains and the reserved top-level names (RFC 2606, RFC 6761)', () => {
      for (const email of [
        'demo@example.com',
        'someone@example.net',
        'someone@example.org',
        'someone@clinic.example',
        'someone@clinic.test',
        'someone@nowhere.invalid',
        'someone@app.localhost',
      ]) {
        expect(isReservedEmailDomain(email), email).toBe(true);
      }
    });

    it('matches a subdomain, any letter case and a trailing dot', () => {
      expect(isReservedEmailDomain('staff@mail.example.com')).toBe(true);
      expect(isReservedEmailDomain('Demo@EXAMPLE.COM')).toBe(true);
      expect(isReservedEmailDomain('demo@example.com.')).toBe(true);
    });

    it('leaves real domains alone, including ones that only contain a reserved name', () => {
      for (const email of [
        'user@gmail.com',
        'owner@clinic.in',
        'someone@myexample.com',
        'someone@example.com.au',
        'someone@testing.io',
        'someone@contest',
      ]) {
        expect(isReservedEmailDomain(email), email).toBe(false);
      }
    });
  });
});
