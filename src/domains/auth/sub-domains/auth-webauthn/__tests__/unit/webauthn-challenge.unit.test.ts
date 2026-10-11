import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import { UnauthorizedError } from '@/shared/errors/index.js';
import { WEBAUTHN_CHALLENGE_TTL_SECONDS } from '@/shared/constants/index.js';
import {
  createWebauthnChallenge,
  consumeWebauthnChallenge,
  WEBAUTHN_CHALLENGE_KEY_PREFIX,
} from '@/domains/auth/sub-domains/auth-webauthn/webauthn-challenge.js';

describe('webauthn-challenge', () => {
  const redis = {
    set: vi.fn(),
    getdel: vi.fn(),
  } as unknown as Redis;

  beforeEach(() => {
    vi.mocked(redis.set).mockReset();
    vi.mocked(redis.getdel).mockReset();
  });

  it('createWebauthnChallenge stores JSON payload with TTL', async () => {
    const token = await createWebauthnChallenge({
      redis,
      kind: 'registration',
      userPublicId: 'user_public_abc',
      challenge: 'challenge-base64url',
    });
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining(WEBAUTHN_CHALLENGE_KEY_PREFIX),
      JSON.stringify({
        kind: 'registration',
        user_public_id: 'user_public_abc',
        challenge: 'challenge-base64url',
      }),
      'EX',
      WEBAUTHN_CHALLENGE_TTL_SECONDS,
    );
  });

  it('createWebauthnChallenge returns unique tokens across invocations', async () => {
    vi.mocked(redis.set).mockResolvedValue('OK' as never);
    const a = await createWebauthnChallenge({
      redis,
      kind: 'registration',
      userPublicId: 'user_public_abc',
      challenge: 'c1',
    });
    const b = await createWebauthnChallenge({
      redis,
      kind: 'registration',
      userPublicId: 'user_public_abc',
      challenge: 'c1',
    });
    expect(a).not.toBe(b);
  });

  it('consumeWebauthnChallenge rejects empty challenge token', async () => {
    await expect(
      consumeWebauthnChallenge({ redis, challengeToken: '', expectedKind: 'registration' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(redis.getdel).not.toHaveBeenCalled();
  });

  it('consumeWebauthnChallenge rejects expired/missing Redis entry', async () => {
    vi.mocked(redis.getdel).mockResolvedValue(null);
    await expect(
      consumeWebauthnChallenge({
        redis,
        challengeToken: 'token-abc',
        expectedKind: 'registration',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('consumeWebauthnChallenge rejects malformed JSON payload', async () => {
    vi.mocked(redis.getdel).mockResolvedValue('{not-json');
    await expect(
      consumeWebauthnChallenge({
        redis,
        challengeToken: 'token-abc',
        expectedKind: 'registration',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it.each([
    ['null', null],
    ['a number', 42],
    ['a boolean', true],
    ['a string', 'authentication'],
    ['an array', [{ kind: 'authentication', user_public_id: 'user_public_abc', challenge: 'c1' }]],
    ['missing fields', { kind: 'authentication' }],
    ['a missing kind', { user_public_id: 'user_public_abc', challenge: 'c1' }],
    ['an unknown kind', { kind: 'other', user_public_id: 'user_public_abc', challenge: 'c1' }],
    ['a numeric kind', { kind: 123, user_public_id: 'user_public_abc', challenge: 'c1' }],
    ['a null user id', { kind: 'authentication', user_public_id: null, challenge: 'c1' }],
    ['a numeric user id', { kind: 'authentication', user_public_id: 123, challenge: 'c1' }],
    ['a boolean user id', { kind: 'authentication', user_public_id: true, challenge: 'c1' }],
    ['an object user id', { kind: 'authentication', user_public_id: {}, challenge: 'c1' }],
    [
      'an array user id',
      { kind: 'authentication', user_public_id: ['user_public_abc'], challenge: 'c1' },
    ],
    ['an empty user id', { kind: 'authentication', user_public_id: '', challenge: 'c1' }],
    [
      'a whitespace-only user id',
      { kind: 'authentication', user_public_id: '  ', challenge: 'c1' },
    ],
    ['a missing challenge', { kind: 'authentication', user_public_id: 'user_public_abc' }],
    [
      'a null challenge',
      { kind: 'authentication', user_public_id: 'user_public_abc', challenge: null },
    ],
    [
      'a numeric challenge',
      { kind: 'authentication', user_public_id: 'user_public_abc', challenge: 123 },
    ],
    [
      'a boolean challenge',
      { kind: 'authentication', user_public_id: 'user_public_abc', challenge: true },
    ],
    [
      'an array challenge',
      { kind: 'authentication', user_public_id: 'user_public_abc', challenge: ['c1'] },
    ],
    [
      'an object challenge',
      { kind: 'authentication', user_public_id: 'user_public_abc', challenge: {} },
    ],
    [
      'an empty challenge',
      { kind: 'authentication', user_public_id: 'user_public_abc', challenge: '' },
    ],
    [
      'a whitespace-only challenge',
      { kind: 'authentication', user_public_id: 'user_public_abc', challenge: '  ' },
    ],
  ])(
    'rejects valid JSON containing %s with a typed denial and consumes the entry',
    async (_label, payload) => {
      vi.mocked(redis.getdel)
        .mockResolvedValueOnce(JSON.stringify(payload))
        .mockResolvedValueOnce(null);
      const consumption = consumeWebauthnChallenge({
        redis,
        challengeToken: 'invalid-payload-token',
        expectedKind: 'authentication',
      });
      await expect(consumption).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(consumption).rejects.toMatchObject({
        messageKey: 'errors:webauthnInvalidChallenge',
      });
      expect(redis.getdel).toHaveBeenCalledOnce();
      expect(redis.getdel).toHaveBeenCalledWith(
        `${WEBAUTHN_CHALLENGE_KEY_PREFIX}invalid-payload-token`,
      );
      await expect(
        consumeWebauthnChallenge({
          redis,
          challengeToken: 'invalid-payload-token',
          expectedKind: 'authentication',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(redis.getdel).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['registration', 'authentication'] as const)(
    'preserves additional metadata and an opaque challenge owner for %s',
    async (kind) => {
      const payload = {
        kind,
        user_public_id: 'decoy:opaque-challenge-owner',
        challenge: 'challenge-base64url',
        metadata: { request_id: 'request-1' },
      };
      vi.mocked(redis.getdel).mockResolvedValueOnce(JSON.stringify(payload));
      await expect(
        consumeWebauthnChallenge({ redis, challengeToken: 'metadata-token', expectedKind: kind }),
      ).resolves.toEqual(payload);
      expect(redis.getdel).toHaveBeenCalledOnce();
    },
  );

  it('consumeWebauthnChallenge rejects when kind does not match expected', async () => {
    vi.mocked(redis.getdel).mockResolvedValue(
      JSON.stringify({
        kind: 'authentication',
        user_public_id: 'user_public_abc',
        challenge: 'c1',
      }),
    );
    await expect(
      consumeWebauthnChallenge({
        redis,
        challengeToken: 'token-abc',
        expectedKind: 'registration',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    // GETDEL already removed the token, so a mismatched kind cannot be reused
    expect(redis.getdel).toHaveBeenCalled();
  });

  it('consumeWebauthnChallenge atomically reads-and-deletes the token on successful consume', async () => {
    vi.mocked(redis.getdel).mockResolvedValue(
      JSON.stringify({
        kind: 'authentication',
        user_public_id: 'user_public_abc',
        challenge: 'c1',
      }),
    );
    const payload = await consumeWebauthnChallenge({
      redis,
      challengeToken: 'token-success',
      expectedKind: 'authentication',
    });
    expect(payload.user_public_id).toBe('user_public_abc');
    expect(payload.challenge).toBe('c1');
    expect(redis.getdel).toHaveBeenCalledWith(`${WEBAUTHN_CHALLENGE_KEY_PREFIX}token-success`);
  });

  it('consumeWebauthnChallenge rejects replayed token after first successful consume', async () => {
    vi.mocked(redis.getdel).mockResolvedValueOnce(
      JSON.stringify({
        kind: 'registration',
        user_public_id: 'user_public_abc',
        challenge: 'c1',
      }),
    );
    await expect(
      consumeWebauthnChallenge({
        redis,
        challengeToken: 'replay-token',
        expectedKind: 'registration',
      }),
    ).resolves.toEqual({
      kind: 'registration',
      user_public_id: 'user_public_abc',
      challenge: 'c1',
    });

    vi.mocked(redis.getdel).mockResolvedValueOnce(null);
    await expect(
      consumeWebauthnChallenge({
        redis,
        challengeToken: 'replay-token',
        expectedKind: 'registration',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('consumeWebauthnChallenge lets exactly one of two concurrent consumes succeed (atomic GETDEL)', async () => {
    let consumed = false;
    vi.mocked(redis.getdel).mockImplementation(async () => {
      if (consumed) return null;
      consumed = true;
      return JSON.stringify({
        kind: 'authentication',
        user_public_id: 'user_public_abc',
        challenge: 'c1',
      });
    });

    const results = await Promise.allSettled([
      consumeWebauthnChallenge({
        redis,
        challengeToken: 'race-token',
        expectedKind: 'authentication',
      }),
      consumeWebauthnChallenge({
        redis,
        challengeToken: 'race-token',
        expectedKind: 'authentication',
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
