import {
  invalidateTombstonedCacheEntry,
  populateTombstonedCacheEntry,
  readTombstonedCacheEntry,
} from '@/infrastructure/cache/redis-tombstone-cache.util.js';
import { CACHE_INVALIDATION_TOMBSTONE_TTL_SECONDS } from '@/shared/constants/ttl.constants.js';

/**
 * Redis cache for the organization → default-locale resolution used by the
 * i18n preHandler (sec-M1).
 *
 * @remarks
 * The i18n preHandler runs on EVERY unauthenticated request that supplies an
 * authenticated request without `Accept-Language` — the most exposed
 * surface in the app. Without a cache, each such request fires the
 * SECURITY DEFINER function `tenancy.resolve_organization_default_locale`,
 * which lets a distributed attacker drive thousands of pre-auth Postgres
 * round-trips per second and use the differential locale response as an
 * organization-existence oracle.
 *
 * This cache stores the resolved locale (the canonical `'en'` fallback
 * included) under a short-lived key so a repeated lookup short-circuits to
 * Redis. Cache-miss-on-Redis-error is the bail-out: never block the request
 * on a cache outage — fall back to the DB, log, and move on.
 */
const I18N_LOCALE_CACHE_PREFIX = 'i18n:locale';
const I18N_LOCALE_CACHE_TTL_SECONDS = 300;
const I18N_LOCALE_METRIC = 'i18n-locale';

function buildKey(organizationPublicId: string): string {
  return `${I18N_LOCALE_CACHE_PREFIX}:${organizationPublicId}`;
}

/**
 * Returns the cached default locale for an organization, or `null` when the
 * cache holds no value (or Redis is unreachable). Callers must fall back to
 * the DB resolver on `null`.
 */
export async function getCachedOrganizationDefaultLocale(
  organizationPublicId: string,
): Promise<string | null> {
  return readTombstonedCacheEntry({
    key: buildKey(organizationPublicId),
    metricName: I18N_LOCALE_METRIC,
  });
}

/**
 * Stores the resolved default locale for an organization with a 5-minute TTL — never over an
 * invalidation tombstone (`SET … NX`), so a read that resolved the old locale just before a change
 * committed cannot reinstall it. Best-effort: a Redis outage logs at `warn` and does NOT propagate,
 * so the resolution path returns the freshly-computed value regardless.
 */
export async function setCachedOrganizationDefaultLocale({
  organizationPublicId,
  locale,
}: {
  organizationPublicId: string;
  locale: string;
}): Promise<void> {
  await populateTombstonedCacheEntry({
    key: buildKey(organizationPublicId),
    value: locale,
    ttlSeconds: I18N_LOCALE_CACHE_TTL_SECONDS,
    metricName: I18N_LOCALE_METRIC,
  });
}

/**
 * Invalidates the cached default locale for an organization with a short tombstone (not a `DEL`,
 * which an in-flight read could overwrite with the old value). Called after the organization-settings
 * mutation that changes the default locale commits, so a dashboard switch from `'en' → 'es'` reflects
 * in the next request rather than waiting up to {@link I18N_LOCALE_CACHE_TTL_SECONDS}. Best-effort.
 */
export async function invalidateCachedOrganizationDefaultLocale(
  organizationPublicId: string,
): Promise<void> {
  await invalidateTombstonedCacheEntry({
    key: buildKey(organizationPublicId),
    ttlSeconds: CACHE_INVALIDATION_TOMBSTONE_TTL_SECONDS,
    metricName: I18N_LOCALE_METRIC,
  });
}
