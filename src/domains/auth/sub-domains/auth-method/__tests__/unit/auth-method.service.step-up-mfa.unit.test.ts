import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/utils/security/password.util.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed'),
  verifyPassword: vi.fn().mockResolvedValue({ valid: true, needsRehash: false }),
}));

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Blanket maintenance passthrough: services this suite touches (directly or via
    // cross-domain imports) may enter maintenance contexts (tombstoning, admin reads) —
    // the real wrapper opens a database.transaction() and CI's unit lane has no Postgres.
    withMaintenanceDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
    withAppDatabaseContext: vi.fn(
      async ({ scope: _scope, callback }: { scope: unknown; callback: () => Promise<unknown> }) =>
        callback(),
    ),
  };
});

import type { Redis } from 'ioredis';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/shared/errors/index.js';
import {
  ACCOUNT_LOCKOUT_MINUTES,
  MAX_FAILED_LOGIN_ATTEMPTS,
  MAX_PASSWORD_STEP_UP_ATTEMPTS,
  PASSWORD_STEP_UP_ATTEMPT_WINDOW_SECONDS,
} from '@/shared/constants/security.constants.js';
import { AuthMethodService } from '@/domains/auth/sub-domains/auth-method/auth-method.service.js';
import { verifyPassword } from '@/shared/utils/security/password.util.js';
import type { UserService } from '@/domains/user/user.service.js';
import type { AuthMethodRepository } from '@/domains/auth/sub-domains/auth-method/auth-method.repository.js';
import type { VerificationTokenRepository } from '@/domains/auth/sub-domains/auth-method/verification-token/verification-token.repository.js';
import type { AuthSessionService } from '@/domains/auth/sub-domains/auth-session/auth-session.service.js';

/**
 * Regression for sec-A1 (High): the `/auth/step-up` route — gate in front of every sensitive
 * credential mutation (`mfa/enroll`, `mfa/:id` delete, `webauthn/register/*`, `me/auth-methods`
 * create/delete, `password/change`) — must NOT accept a password-only step-up when the user
 * has MFA enabled. Otherwise a transient stolen-session compromise plus knowledge of the
 * password is enough to delete MFA, register a passkey, and convert the stolen window into
 * permanent account access.
 *
 * MFA users must step up via `/auth/me/mfa/verify` (which already records `recordRecentStepUp`)
 * — not via password-only re-verification.
 */
describe('AuthMethodService.verifyPasswordForStepUp — MFA bypass guard (sec-A1)', () => {
  const userService = {
    requireUserRecordByPublicId: vi.fn(),
    registerFailedLoginAttempt: vi.fn(),
  } as unknown as UserService;
  const authMethodRepository = {} as AuthMethodRepository;
  const verificationTokenRepository = {} as VerificationTokenRepository;
  const authSessionService = { revoke: vi.fn() } as unknown as AuthSessionService;
  /** In-memory stand-in for the attempt counter: `eval` is the INCR-with-expiry script. */
  const counters = new Map<string, number>();
  const redis = {
    eval: vi.fn(async (_script: string, _keyCount: number, key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    del: vi.fn(async (key: string) => (counters.delete(key) ? 1 : 0)),
  } as unknown as Redis;

  const service = new AuthMethodService(
    userService,
    authMethodRepository,
    verificationTokenRepository,
    authSessionService,
    redis,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    counters.clear();
    vi.mocked(verifyPassword).mockResolvedValue({ valid: true, needsRehash: false });
  });

  it('refuses password-only step-up for an MFA-enabled user (force MFA verify instead)', async () => {
    vi.mocked(userService.requireUserRecordByPublicId).mockResolvedValue({
      id: 1,
      public_id: 'user_pub',
      email: 'mfa@example.com',
      status: 'ACTIVE',
      password_hash: 'hashed',
      is_mfa_enabled: true,
      is_email_verified: true,
    } as never);

    await expect(
      service.verifyPasswordForStepUp({
        userPublicId: 'user_pub',
        sessionPublicId: 'sess_pub',
        password: 'correct-password',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // `verifyPassword` should not even be invoked — the MFA-required check fires first to
    // also avoid the password-timing oracle.
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('still allows password step-up for a non-MFA user (control case — normal flow works)', async () => {
    vi.mocked(userService.requireUserRecordByPublicId).mockResolvedValue({
      id: 1,
      public_id: 'user_pub',
      email: 'nomfa@example.com',
      status: 'ACTIVE',
      password_hash: 'hashed',
      is_mfa_enabled: false,
      is_email_verified: true,
    } as never);

    await expect(
      service.verifyPasswordForStepUp({
        userPublicId: 'user_pub',
        sessionPublicId: 'sess_pub',
        password: 'correct-password',
      }),
    ).resolves.toBeUndefined();

    expect(verifyPassword).toHaveBeenCalledWith({
      plaintext: 'correct-password',
      storedHash: 'hashed',
    });
  });

  it('still rejects an incorrect password for a non-MFA user (negative control)', async () => {
    vi.mocked(userService.requireUserRecordByPublicId).mockResolvedValue({
      id: 1,
      public_id: 'user_pub',
      email: 'nomfa@example.com',
      status: 'ACTIVE',
      password_hash: 'hashed',
      is_mfa_enabled: false,
      is_email_verified: true,
    } as never);
    vi.mocked(verifyPassword).mockResolvedValue({ valid: false, needsRehash: false });

    await expect(
      service.verifyPasswordForStepUp({
        userPublicId: 'user_pub',
        sessionPublicId: 'sess_pub',
        password: 'wrong',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

/**
 * A-3: a password step-up is an online password oracle for anyone holding a session. Wrong
 * passwords count toward the login lockout, one user gets five attempts per fifteen minutes, and
 * the session that spends the budget is revoked.
 */
describe('AuthMethodService.verifyPasswordForStepUp — attempt budget (A-3)', () => {
  const userService = {
    requireUserRecordByPublicId: vi.fn(),
    registerFailedLoginAttempt: vi.fn(),
  } as unknown as UserService;
  const authSessionService = { revoke: vi.fn() } as unknown as AuthSessionService;
  const counters = new Map<string, number>();
  const ttls = new Map<string, number>();
  const redis = {
    eval: vi.fn(async (_script: string, _keyCount: number, key: string, ttl: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      if (next === 1) ttls.set(key, Number(ttl));
      return next;
    }),
    del: vi.fn(async (key: string) => (counters.delete(key) ? 1 : 0)),
  } as unknown as Redis;
  const service = new AuthMethodService(
    userService,
    {} as AuthMethodRepository,
    {} as VerificationTokenRepository,
    authSessionService,
    redis,
  );
  const stepUp = (password: string) =>
    service.verifyPasswordForStepUp({
      userPublicId: 'user_pub',
      sessionPublicId: 'sess_pub',
      password,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    counters.clear();
    ttls.clear();
    vi.mocked(userService.requireUserRecordByPublicId).mockResolvedValue({
      id: 1,
      public_id: 'user_pub',
      email: 'nomfa@example.com',
      status: 'ACTIVE',
      password_hash: 'hashed',
      is_mfa_enabled: false,
      is_email_verified: true,
    } as never);
    vi.mocked(verifyPassword).mockResolvedValue({ valid: false, needsRehash: false });
  });

  it('counts a wrong step-up password toward the login lockout', async () => {
    await expect(stepUp('wrong')).rejects.toMatchObject({
      messageKey: 'errors:currentPasswordIncorrect',
    });
    expect(userService.registerFailedLoginAttempt).toHaveBeenCalledWith({
      public_id: 'user_pub',
      options: { maxAttempts: MAX_FAILED_LOGIN_ATTEMPTS, lockoutMinutes: ACCOUNT_LOCKOUT_MINUTES },
    });
    expect([...ttls.values()]).toEqual([PASSWORD_STEP_UP_ATTEMPT_WINDOW_SECONDS]);
    expect(authSessionService.revoke).not.toHaveBeenCalled();
  });

  it('revokes the session on the wrong password that spends the budget', async () => {
    for (let attempt = 1; attempt < MAX_PASSWORD_STEP_UP_ATTEMPTS; attempt += 1) {
      await expect(stepUp('wrong')).rejects.toMatchObject({
        messageKey: 'errors:currentPasswordIncorrect',
      });
    }
    expect(authSessionService.revoke).not.toHaveBeenCalled();

    await expect(stepUp('wrong')).rejects.toMatchObject({
      messageKey: 'errors:stepUpAttemptsExhausted',
    });
    expect(authSessionService.revoke).toHaveBeenCalledWith({
      userPublicId: 'user_pub',
      sessionPublicId: 'sess_pub',
    });
    expect(userService.registerFailedLoginAttempt).toHaveBeenCalledTimes(
      MAX_PASSWORD_STEP_UP_ATTEMPTS,
    );
  });

  it('refuses even the correct password once the budget is spent, without comparing it', async () => {
    counters.set('auth:password_step_up_attempts:user_pub', MAX_PASSWORD_STEP_UP_ATTEMPTS);
    vi.mocked(verifyPassword).mockResolvedValue({ valid: true, needsRehash: false });
    vi.mocked(authSessionService.revoke).mockRejectedValueOnce(new NotFoundError('Session'));

    await expect(stepUp('correct-password')).rejects.toMatchObject({
      messageKey: 'errors:stepUpAttemptsExhausted',
    });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(authSessionService.revoke).toHaveBeenCalledTimes(1);
  });

  it('a correct password clears the budget', async () => {
    await expect(stepUp('wrong')).rejects.toBeInstanceOf(UnauthorizedError);
    vi.mocked(verifyPassword).mockResolvedValue({ valid: true, needsRehash: false });

    await expect(stepUp('correct-password')).resolves.toBeUndefined();
    expect(counters.size).toBe(0);
  });
});
