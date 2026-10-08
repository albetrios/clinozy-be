import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SESSION_TOKEN_CACHE_TTL_SECONDS } from '@/shared/constants/index.js';

const randomIntMock = vi.hoisted(() => vi.fn(() => 0));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomInt: randomIntMock };
});

const redisSet = vi.fn().mockResolvedValue('OK');
const redisGet = vi.fn().mockResolvedValue(null);
const redisDel = vi.fn().mockResolvedValue(1);

vi.mock('@/infrastructure/cache/redis.client.js', () => ({
  redisConnection: {
    set: (...args: unknown[]) => redisSet(...args),
    get: (...args: unknown[]) => redisGet(...args),
    del: (...args: unknown[]) => redisDel(...args),
  },
}));

const NOW = new Date('2026-05-29T12:00:00.000Z').getTime();

describe('setCachedSessionTokenValid (bounded TTL)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    randomIntMock.mockReturnValue(0);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('caps the TTL at the full cache window when the session outlives it', async () => {
    const { setCachedSessionTokenValid } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    await setCachedSessionTokenValid({
      sessionTokenHash: 'hash-long',
      sessionPublicId: 'sess_long',
      sessionExpiresAt: new Date(NOW + 60 * 60 * 1000),
    });
    expect(redisSet).toHaveBeenCalledWith(
      'session:tok:hash-long',
      'sess_long',
      'EX',
      SESSION_TOKEN_CACHE_TTL_SECONDS,
      'NX',
    );
  });

  it('shortens the TTL to the remaining session lifetime when it expires sooner', async () => {
    const { setCachedSessionTokenValid } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    await setCachedSessionTokenValid({
      sessionTokenHash: 'hash-short',
      sessionPublicId: 'sess_short',
      sessionExpiresAt: new Date(NOW + 10_000),
    });
    expect(redisSet).toHaveBeenCalledWith('session:tok:hash-short', 'sess_short', 'EX', 10, 'NX');
  });

  it('subtracts up to ten seconds of jitter from the populate TTL', async () => {
    randomIntMock.mockReturnValue(10);
    const { setCachedSessionTokenValid } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    await setCachedSessionTokenValid({
      sessionTokenHash: 'hash-jitter',
      sessionPublicId: 'sess_jitter',
      sessionExpiresAt: new Date(NOW + 60 * 60 * 1000),
    });
    expect(redisSet).toHaveBeenCalledWith(
      'session:tok:hash-jitter',
      'sess_jitter',
      'EX',
      SESSION_TOKEN_CACHE_TTL_SECONDS - 10,
      'NX',
    );
  });

  it('does not cache when the session has already expired', async () => {
    const { setCachedSessionTokenValid } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    await setCachedSessionTokenValid({
      sessionTokenHash: 'hash-expired',
      sessionPublicId: 'sess_expired',
      sessionExpiresAt: new Date(NOW - 1_000),
    });
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('does not cache when the bounded TTL rounds down to zero', async () => {
    const { setCachedSessionTokenValid } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    await setCachedSessionTokenValid({
      sessionTokenHash: 'hash-sub-second',
      sessionPublicId: 'sess_sub',
      sessionExpiresAt: new Date(NOW + 500),
    });
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('swallows Redis errors so the caller still succeeds', async () => {
    redisSet.mockRejectedValueOnce(new Error('redis down'));
    const { setCachedSessionTokenValid } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    await expect(
      setCachedSessionTokenValid({
        sessionTokenHash: 'hash-error',
        sessionPublicId: 'sess_error',
        sessionExpiresAt: new Date(NOW + 60_000),
      }),
    ).resolves.toBeUndefined();
  });
});

describe("revocation tombstone (route-audit session-#1: revoke can't be repopulated)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invalidate writes a short-lived REVOKED tombstone (not a DEL) so a racing populate can't un-revoke", async () => {
    const { invalidateCachedSessionToken } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    await invalidateCachedSessionToken('hash-revoked');
    expect(redisSet).toHaveBeenCalledWith(
      'session:tok:hash-revoked',
      '__revoked__',
      'EX',
      SESSION_TOKEN_CACHE_TTL_SECONDS,
    );
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('reads a tombstoned hash as a cache MISS so the caller re-checks Postgres (which denies it)', async () => {
    redisGet.mockResolvedValueOnce('__revoked__');
    const { getCachedSessionTokenValid } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    expect(await getCachedSessionTokenValid('hash-revoked')).toBeNull();
  });

  it('returns the cached session public id on a normal (non-tombstone) hit', async () => {
    redisGet.mockResolvedValueOnce('sess_live');
    const { getCachedSessionTokenValid } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    expect(await getCachedSessionTokenValid('hash-live')).toBe('sess_live');
  });
});

describe('coalesceSessionTokenMiss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisGet.mockResolvedValue(null);
  });

  it('runs one load for concurrent misses of the same token hash', async () => {
    const { coalesceSessionTokenMiss } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    let release: (value: { sessionPublicId: string }) => void = () => undefined;
    const gate = new Promise<{ sessionPublicId: string }>((resolve) => {
      release = resolve;
    });
    const load = vi.fn(() => gate);

    const first = coalesceSessionTokenMiss({ sessionTokenHash: 'hash-shared', load });
    const second = coalesceSessionTokenMiss({ sessionTokenHash: 'hash-shared', load });
    release({ sessionPublicId: 'sess_shared' });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { sessionPublicId: 'sess_shared' },
      { sessionPublicId: 'sess_shared' },
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('re-reads the cache after the shared load so a joiner does not keep a stale id', async () => {
    redisGet.mockResolvedValueOnce(null).mockResolvedValue('sess_after');
    const { coalesceSessionTokenMiss } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    let release: (value: { sessionPublicId: string }) => void = () => undefined;
    const gate = new Promise<{ sessionPublicId: string }>((resolve) => {
      release = resolve;
    });
    const load = vi.fn(() => gate);
    const first = coalesceSessionTokenMiss({ sessionTokenHash: 'hash-reread', load });
    const second = coalesceSessionTokenMiss({ sessionTokenHash: 'hash-reread', load });
    release({ sessionPublicId: 'sess_leader' });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { sessionPublicId: 'sess_after' },
      { sessionPublicId: 'sess_after' },
    ]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('denies every waiter when a revocation tombstone lands during the load', async () => {
    redisGet.mockResolvedValueOnce(null).mockResolvedValue('__revoked__');
    const { coalesceSessionTokenMiss } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    const load = vi.fn(async () => ({ sessionPublicId: 'sess_live' }));

    await expect(
      coalesceSessionTokenMiss({ sessionTokenHash: 'hash-revoked-flight', load }),
    ).rejects.toMatchObject({ messageKey: 'errors:invalidOrExpiredSession' });
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('does not cache a leader rejection and loads again on the next miss', async () => {
    const { coalesceSessionTokenMiss } = await import(
      '@/domains/auth/sub-domains/auth-session/session-token-cache.service.js'
    );
    const load = vi
      .fn<() => Promise<{ sessionPublicId: string }>>()
      .mockRejectedValueOnce(new Error('database down'))
      .mockResolvedValueOnce({ sessionPublicId: 'sess_retry' });

    await expect(
      coalesceSessionTokenMiss({ sessionTokenHash: 'hash-reject', load }),
    ).rejects.toThrow('database down');
    await expect(
      coalesceSessionTokenMiss({ sessionTokenHash: 'hash-reject', load }),
    ).resolves.toEqual({ sessionPublicId: 'sess_retry' });
    expect(load).toHaveBeenCalledTimes(2);
    expect(redisSet).not.toHaveBeenCalled();
  });
});
