import { randomInt } from 'node:crypto';
import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { SESSION_TOKEN_CACHE_TTL_SECONDS } from '@/shared/constants/index.js';
import { UnauthorizedError } from '@/shared/errors/index.js';
import { createSingleflight } from '@/shared/utils/infrastructure/singleflight.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

const SESSION_TOKEN_CACHE_PREFIX = 'session:tok';

const sessionTokenMissLoads = createSingleflight<{ sessionPublicId: string }>();

/**
 * Revocation tombstone value. `invalidateCachedSessionToken` writes this (not a DEL) so a concurrent
 * in-flight validation that read the session row as active BEFORE a revoke committed cannot
 * repopulate a "valid" entry afterwards: the tombstone blocks the `NX` populate and reads back as a
 * cache miss (the DB re-check then denies). Bounded by the cache TTL, the same window a populate can
 * span. Closes the populate-vs-invalidate TOCTOU (route-audit session-#1).
 */
const SESSION_TOKEN_REVOKED_TOMBSTONE = '__revoked__';

/** Inclusive downward spread subtracted from the 60 second populate cap, so expiries do not align. */
const SESSION_TOKEN_POPULATE_TTL_JITTER_SPAN_SECONDS = 10;

type SessionTokenCacheRead =
  | { status: 'hit'; sessionPublicId: string }
  | { status: 'miss' }
  | { status: 'revoked' };

function buildSessionTokenCacheKey(sessionTokenHash: string): string {
  return `${SESSION_TOKEN_CACHE_PREFIX}:${sessionTokenHash}`;
}

/** Reads the raw cache entry, distinguishing a miss from a revocation tombstone. */
async function readSessionTokenCache(sessionTokenHash: string): Promise<SessionTokenCacheRead> {
  try {
    const cached = await redisConnection.get(buildSessionTokenCacheKey(sessionTokenHash));
    if (cached === null || cached.length === 0) return { status: 'miss' };
    if (cached === SESSION_TOKEN_REVOKED_TOMBSTONE) return { status: 'revoked' };
    return { status: 'hit', sessionPublicId: cached };
  } catch (error) {
    logger.warn({ error }, 'session-token-cache.get.failed');
    return { status: 'miss' };
  }
}

/** A hit returns the cached id. A revocation tombstone is a denial, not a miss. */
function sessionFromCacheRead(read: SessionTokenCacheRead): { sessionPublicId: string } | null {
  if (read.status === 'revoked') {
    throw new UnauthorizedError('errors:invalidOrExpiredSession');
  }
  if (read.status === 'hit') return { sessionPublicId: read.sessionPublicId };
  return null;
}

/**
 * Returns the cached session public id when the token hash was recently validated against
 * an active session, or `null` on cache miss.
 *
 * @remarks
 * - **Algorithm:** Redis `GET session:tok:<hash>`; the stored value is the session's
 *   `public_id`, allowing callers to recover the session identity from cache without
 *   a Postgres round-trip. A cache hit means the bearer was confirmed active within
 *   {@link SESSION_TOKEN_CACHE_TTL_SECONDS}. A revocation tombstone reads as a miss.
 * - **Failure modes:** Redis failures are logged and swallowed — the function returns
 *   `null` so the caller falls back to the database (fail-open on availability,
 *   fail-closed on staleness because the DB is the source of truth).
 * - **Side effects:** read-only Redis lookup.
 * - **Notes:** consumed by {@link AuthSessionService.verifyActiveAccessToken} to skip the
 *   `sessions` query on hot bearer-auth paths. Stores the session id (not a `'1'` sentinel)
 *   so step-up binding (sec-A2) can resolve which session a bearer belongs to without
 *   re-reading the row.
 */
export async function getCachedSessionTokenValid(sessionTokenHash: string): Promise<string | null> {
  const read = await readSessionTokenCache(sessionTokenHash);
  return read.status === 'hit' ? read.sessionPublicId : null;
}

/**
 * Input for {@link setCachedSessionTokenValid}: the token hash, the backing session's public
 * id, and its expiry — the value stored is the public id so callers can recover session
 * identity from cache without a Postgres round-trip; the expiry caps the cache TTL so it can
 * never outlive the session.
 *
 * @remarks
 * - **Algorithm:** `sessionExpiresAt` is the authoritative session expiry from Postgres; the
 *   caller derives the cache TTL as `min(SESSION_TOKEN_CACHE_TTL_SECONDS, expires_at - now)`.
 * - **Failure modes:** none — this is a plain data carrier with no behavior.
 * - **Side effects:** none.
 * - **Notes:** `sessionTokenHash` is the hashed access token (never the raw bearer); pairing it with
 *   `sessionExpiresAt` is what prevents a cached "valid" sentinel from outliving the session.
 */
export interface SetCachedSessionTokenValidInput {
  sessionTokenHash: string;
  sessionPublicId: string;
  sessionExpiresAt: Date;
}

/**
 * Marks a token hash as a recently validated active session in Redis, capped to the session lifetime.
 *
 * @remarks
 * - **Algorithm:** `SET session:tok:<hash> <id> EX <ttl> NX` where `ttl =
 *   min(remaining session seconds, SESSION_TOKEN_CACHE_TTL_SECONDS - random(0..10))`.
 *   The downward jitter keeps a herd of sessions from expiring on the same second.
 *   Bounding by the remaining session lifetime ensures the cached entry can never
 *   outlive the session itself. When the bounded TTL is `<= 0` nothing is cached.
 * - **Failure modes:** Redis errors are logged and swallowed; the caller's request
 *   succeeds even when caching is unavailable.
 * - **Side effects:** writes a single short-lived Redis entry (or none when the
 *   bounded TTL is non-positive).
 * - **Notes:** the cache is invalidated on every revoke or rotate via
 *   {@link invalidateCachedSessionToken} to bound staleness to that TTL.
 */
export async function setCachedSessionTokenValid({
  sessionTokenHash,
  sessionPublicId,
  sessionExpiresAt,
}: SetCachedSessionTokenValidInput): Promise<void> {
  const remainingSeconds = Math.floor((sessionExpiresAt.getTime() - Date.now()) / 1000);
  const jitterSeconds = randomInt(0, SESSION_TOKEN_POPULATE_TTL_JITTER_SPAN_SECONDS + 1);
  const ttlSeconds = Math.min(remainingSeconds, SESSION_TOKEN_CACHE_TTL_SECONDS - jitterSeconds);
  if (ttlSeconds <= 0) {
    return;
  }
  try {
    // `NX`: never overwrite an existing key. If a concurrent revoke has written the revocation
    // tombstone, this in-flight (pre-revoke) populate is a no-op, so a revoked bearer can't be
    // re-cached as valid (route-audit session-#1).
    await redisConnection.set(
      buildSessionTokenCacheKey(sessionTokenHash),
      sessionPublicId,
      'EX',
      ttlSeconds,
      'NX',
    );
  } catch (error) {
    logger.warn({ error }, 'session-token-cache.set.failed');
  }
}

/**
 * Runs one database load for a session-token cache miss and shares it with concurrent misses
 * of the same token hash.
 *
 * @remarks
 * - **Algorithm:** re-reads the cache, then runs `load` only on a miss. Concurrent callers for the
 *   same hash await that one promise ({@link createSingleflight}). Each caller re-reads the cache
 *   after that promise settles, so a revocation tombstone written while the leader was in Postgres
 *   denies every waiter. A leader rejection is shared, then forgotten — it is never written to Redis.
 * - **Failure modes:** a rejection (invalid session, database error) is shared with every waiter and
 *   then forgotten, so the next request loads again. A revocation tombstone throws
 *   `errors:invalidOrExpiredSession`. Redis read failures count as a miss and fall through to `load`.
 * - **Side effects:** none of its own — `load` performs the database read and the cache populate.
 * - **Notes:** process-local. Two API replicas can still both miss. Callers keep the fast cache-hit
 *   path outside this helper so a warm token does not join an in-flight load.
 */
export async function coalesceSessionTokenMiss(options: {
  sessionTokenHash: string;
  load: () => Promise<{ sessionPublicId: string }>;
}): Promise<{ sessionPublicId: string }> {
  try {
    const loaded = await sessionTokenMissLoads.run({
      key: options.sessionTokenHash,
      load: async () => {
        const cached = sessionFromCacheRead(await readSessionTokenCache(options.sessionTokenHash));
        if (cached !== null) return cached;
        return options.load();
      },
    });
    const cachedAfter = sessionFromCacheRead(await readSessionTokenCache(options.sessionTokenHash));
    return cachedAfter ?? loaded;
  } catch (error) {
    const cachedAfter = await readSessionTokenCache(options.sessionTokenHash);
    if (cachedAfter.status === 'hit') return { sessionPublicId: cachedAfter.sessionPublicId };
    if (cachedAfter.status === 'revoked') {
      throw new UnauthorizedError('errors:invalidOrExpiredSession');
    }
    throw error;
  }
}

/**
 * Drops the cached "valid bearer" sentinel for a token hash so subsequent calls re-check Postgres.
 *
 * @remarks
 * - **Algorithm:** Redis `SET session:tok:<hash> <tombstone> EX SESSION_TOKEN_CACHE_TTL_SECONDS` —
 *   a short-lived REVOCATION TOMBSTONE, NOT a `DEL`. A plain delete left a TOCTOU: a concurrent
 *   validation that read the row as active just before the revoke committed could `SET` a fresh
 *   "valid" entry AFTER the delete, granting the revoked bearer up to a full cache-TTL window. The
 *   tombstone (read as a miss by {@link getCachedSessionTokenValid}, and `NX`-blocking the populate
 *   in {@link setCachedSessionTokenValid}) makes revocation propagate on the very next request.
 * - **Failure modes:** Redis errors are logged and swallowed — staleness is bounded by the TTL.
 * - **Side effects:** writes a single short-lived Redis key.
 * - **Notes:** must be called on session revoke (single + bulk) and on every token-hash rotation so
 *   newly-rotated JWTs don't read a stale cache entry.
 */
export async function invalidateCachedSessionToken(sessionTokenHash: string): Promise<void> {
  try {
    await redisConnection.set(
      buildSessionTokenCacheKey(sessionTokenHash),
      SESSION_TOKEN_REVOKED_TOMBSTONE,
      'EX',
      SESSION_TOKEN_CACHE_TTL_SECONDS,
    );
  } catch (error) {
    logger.warn({ error }, 'session-token-cache.invalidate.failed');
  }
}
