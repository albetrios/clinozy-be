import {
  invalidateTombstonedCacheEntry,
  populateTombstonedCacheEntry,
  readTombstonedCacheEntry,
} from '@/infrastructure/cache/redis-tombstone-cache.util.js';
import { SESSION_TOKEN_CACHE_TTL_SECONDS } from '@/shared/constants/index.js';

const SESSION_TOKEN_CACHE_PREFIX = 'session:tok';

/** Log prefix of this cache's failures (`session-token.cache.get.failed`, …). */
const SESSION_TOKEN_CACHE_METRIC_NAME = 'session-token';

function buildSessionTokenCacheKey(sessionTokenHash: string): string {
  return `${SESSION_TOKEN_CACHE_PREFIX}:${sessionTokenHash}`;
}

/**
 * Returns the cached session public id when the token hash was recently validated against
 * an active session, or `null` on cache miss.
 *
 * @remarks
 * - **Algorithm:** Redis `GET session:tok:<hash>`; the stored value is the session's
 *   `public_id`, allowing callers to recover the session identity from cache without
 *   a Postgres round-trip. A cache hit means the bearer was confirmed active within
 *   {@link SESSION_TOKEN_CACHE_TTL_SECONDS}.
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
  // A revocation tombstone reads as a MISS so the caller re-checks Postgres (which denies the
  // revoked session) instead of trusting a value a racing populate might otherwise have set.
  return readTombstonedCacheEntry({
    key: buildSessionTokenCacheKey(sessionTokenHash),
    metricName: SESSION_TOKEN_CACHE_METRIC_NAME,
  });
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
 * - **Algorithm:** `SETEX session:tok:<hash> 1 <ttl>` where `ttl =
 *   min(SESSION_TOKEN_CACHE_TTL_SECONDS, floor((sessionExpiresAt - now) / 1000))`.
 *   Bounding by the remaining session lifetime ensures the cached "valid" sentinel
 *   can never outlive the session itself — a token validated just before expiry is
 *   no longer accepted once the session actually expires. When the bounded TTL is
 *   `<= 0` (session already expired or expiring within the current second) nothing
 *   is cached and the next check falls back to Postgres.
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
  const ttlSeconds = Math.min(SESSION_TOKEN_CACHE_TTL_SECONDS, remainingSeconds);
  // `NX` (in the helper): never over an existing key. If a concurrent revoke has written the
  // revocation tombstone, this in-flight (pre-revoke) populate is a no-op, so a revoked bearer can't
  // be re-cached as valid (route-audit session-#1). A non-positive TTL caches nothing.
  await populateTombstonedCacheEntry({
    key: buildSessionTokenCacheKey(sessionTokenHash),
    value: sessionPublicId,
    ttlSeconds,
    metricName: SESSION_TOKEN_CACHE_METRIC_NAME,
  });
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
  await invalidateTombstonedCacheEntry({
    key: buildSessionTokenCacheKey(sessionTokenHash),
    ttlSeconds: SESSION_TOKEN_CACHE_TTL_SECONDS,
    metricName: SESSION_TOKEN_CACHE_METRIC_NAME,
  });
}
