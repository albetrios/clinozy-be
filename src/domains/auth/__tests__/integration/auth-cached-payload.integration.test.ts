import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connectRedis, redisConnection } from '@/infrastructure/cache/redis.client.js';
import {
  createMfaSession,
  MFA_SESSION_KEY_PREFIX,
  verifyMfaSession,
} from '@/domains/auth/sub-domains/auth-mfa-session/auth-mfa-session.js';
import {
  consumeWebauthnChallenge,
  createWebauthnChallenge,
  WEBAUTHN_CHALLENGE_KEY_PREFIX,
} from '@/domains/auth/sub-domains/auth-webauthn/webauthn-challenge.js';
import { UnauthorizedError } from '@/shared/errors/index.js';

/** Real Redis checks complement mocked payload validation and prove atomic single-use consumption. */
describe('Auth cached payloads — real Redis consumption', () => {
  const keys = new Set<string>();

  beforeAll(async () => {
    await connectRedis();
  });

  afterEach(async () => {
    if (keys.size) await redisConnection.del(...keys);
    keys.clear();
  });

  it.each([null, { user_public_id: 123 }])(
    'rejects malformed MFA state %j and deletes it',
    async (payload) => {
      const token = randomUUID();
      const key = `${MFA_SESSION_KEY_PREFIX}${token}`;
      keys.add(key);
      await redisConnection.set(key, JSON.stringify(payload), 'EX', 30);
      await expect(
        verifyMfaSession({ redis: redisConnection, mfaSessionToken: token }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(await redisConnection.exists(key)).toBe(0);
      await expect(
        verifyMfaSession({ redis: redisConnection, mfaSessionToken: token }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    },
  );

  it.each([null, { kind: 'authentication' }])(
    'rejects malformed WebAuthn state %j and deletes it',
    async (payload) => {
      const token = randomUUID();
      const key = `${WEBAUTHN_CHALLENGE_KEY_PREFIX}${token}`;
      keys.add(key);
      await redisConnection.set(key, JSON.stringify(payload), 'EX', 30);
      await expect(
        consumeWebauthnChallenge({
          redis: redisConnection,
          challengeToken: token,
          expectedKind: 'authentication',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(await redisConnection.exists(key)).toBe(0);
    },
  );

  it('allows exactly one concurrent consumer of a legitimate MFA session', async () => {
    const token = await createMfaSession({
      redis: redisConnection,
      userPublicId: 'usr_cached_payload_test',
    });
    const key = `${MFA_SESSION_KEY_PREFIX}${token}`;
    keys.add(key);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        verifyMfaSession({ redis: redisConnection, mfaSessionToken: token }),
      ),
    );
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toEqual([
      { status: 'fulfilled', value: { user_public_id: 'usr_cached_payload_test' } },
    ]);
    const rejected = outcomes.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(9);
    for (const result of rejected) {
      if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(UnauthorizedError);
    }
    expect(await redisConnection.exists(key)).toBe(0);
  });

  it('allows exactly one concurrent consumer of a legitimate WebAuthn challenge', async () => {
    const payload = {
      kind: 'authentication' as const,
      user_public_id: 'decoy:cached-payload-test',
      challenge: 'opaque-challenge',
    };
    const token = await createWebauthnChallenge({
      redis: redisConnection,
      kind: payload.kind,
      userPublicId: payload.user_public_id,
      challenge: payload.challenge,
    });
    const key = `${WEBAUTHN_CHALLENGE_KEY_PREFIX}${token}`;
    keys.add(key);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        consumeWebauthnChallenge({
          redis: redisConnection,
          challengeToken: token,
          expectedKind: 'authentication',
        }),
      ),
    );
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toEqual([
      { status: 'fulfilled', value: payload },
    ]);
    const rejected = outcomes.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(9);
    for (const result of rejected) {
      if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(UnauthorizedError);
    }
    expect(await redisConnection.exists(key)).toBe(0);
  });
});
