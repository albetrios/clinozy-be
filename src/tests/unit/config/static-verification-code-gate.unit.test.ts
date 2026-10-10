import { describe, expect, it } from 'vitest';
import { envSchema } from '@/shared/config/env-schema.js';

const base = () => ({ ...process.env });
const hit = (r: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }) =>
  !r.success &&
  (r.error?.issues ?? []).some((i) => i.path[0] === 'AUTH_STATIC_VERIFICATION_CODE_ACCEPT_ENABLED');

describe('AUTH_STATIC_VERIFICATION_CODE_ACCEPT_ENABLED gate', () => {
  it('defaults to false', () => {
    const r = envSchema.safeParse({ ...base(), NODE_ENV: 'local' });
    expect(r.success && r.data.AUTH_STATIC_VERIFICATION_CODE_ACCEPT_ENABLED).toBe(false);
  });

  it('allows true on local', () => {
    const r = envSchema.safeParse({
      ...base(),
      NODE_ENV: 'local',
      AUTH_STATIC_VERIFICATION_CODE_ACCEPT_ENABLED: 'true',
    });
    expect(hit(r as never)).toBe(false);
  });

  // Both deployed targets: a master login code must never be accepted on a hosted runtime.
  for (const target of ['development', 'production'] as const) {
    it(`REFUSES true on ${target}`, () => {
      const r = envSchema.safeParse({
        ...base(),
        NODE_ENV: target,
        AUTH_STATIC_VERIFICATION_CODE_ACCEPT_ENABLED: 'true',
      });
      expect(hit(r as never)).toBe(true);
    });
  }

  it('allows false in production', () => {
    const r = envSchema.safeParse({
      ...base(),
      NODE_ENV: 'production',
      AUTH_STATIC_VERIFICATION_CODE_ACCEPT_ENABLED: 'false',
    });
    expect(hit(r as never)).toBe(false);
  });
});
