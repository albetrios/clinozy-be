import {
  invalidateTombstonedCacheEntry,
  populateTombstonedCacheEntry,
  readTombstonedCacheEntry,
} from '@/infrastructure/cache/redis-tombstone-cache.util.js';
import { CACHE_INVALIDATION_TOMBSTONE_TTL_SECONDS } from '@/shared/constants/ttl.constants.js';
import { OrganizationSettingsRepository } from './organization-settings.repository.js';

const ORGANIZATION_MFA_POLICY_CACHE_PREFIX = 'organization:mfa-required';
/** Short on purpose: the policy is read on every organization-authorized request. */
const ORGANIZATION_MFA_POLICY_CACHE_TTL_SECONDS = 60;
const ORGANIZATION_MFA_POLICY_METRIC = 'organization-mfa-policy';

const organizationSettingsRepository = new OrganizationSettingsRepository();

function buildKey(organizationPublicId: string): string {
  return `${ORGANIZATION_MFA_POLICY_CACHE_PREFIX}:${organizationPublicId}`;
}

/**
 * Whether the organization's security policy requires MFA (`security_policy.mfa_required === true`).
 *
 * @remarks
 * - **Algorithm:** Redis read-through cache (60 s) over the SECURITY DEFINER resolver
 *   `tenancy.organization_requires_mfa`, on the shared tombstone protocol: the populate is
 *   `SET … NX`, so a read that fetched the old policy just before a change committed cannot
 *   reinstall it over {@link invalidateOrganizationMfaPolicy}'s tombstone — a policy change applies
 *   on the next request.
 * - **Failure modes:** fails CLOSED — a Redis read error falls through to Postgres (never assumes
 *   "no MFA"); a Redis write error is logged and ignored; a database error propagates.
 * - **Side effects:** may write one Redis key.
 * - **Used by:** organization switch and refresh (auth service) and per-request organization
 *   authorization (`requireOrganizationPermission`), which admit an MFA-required organization only
 *   for a session that proved a second factor.
 */
export async function organizationRequiresMfa(organizationPublicId: string): Promise<boolean> {
  const key = buildKey(organizationPublicId);
  const cached = await readTombstonedCacheEntry(key, ORGANIZATION_MFA_POLICY_METRIC);
  if (cached === 'true' || cached === 'false') return cached === 'true';
  const requiresMfa =
    await organizationSettingsRepository.organizationRequiresMfa(organizationPublicId);
  await populateTombstonedCacheEntry({
    key,
    value: requiresMfa ? 'true' : 'false',
    ttlSeconds: ORGANIZATION_MFA_POLICY_CACHE_TTL_SECONDS,
    metricName: ORGANIZATION_MFA_POLICY_METRIC,
  });
  return requiresMfa;
}

/**
 * Invalidates the cached MFA policy for an organization — called after its security policy
 * changes (after the commit) so the next request reads the new value instead of waiting for the TTL.
 *
 * @remarks
 * A tombstone, not a `DEL`: a plain delete let an in-flight read reinstall the old value — a
 * session without a second factor kept passing for up to the 60 s TTL after MFA became required.
 * Best-effort: a Redis error is logged; the TTL bounds how long a stale value can survive.
 */
export async function invalidateOrganizationMfaPolicy(organizationPublicId: string): Promise<void> {
  await invalidateTombstonedCacheEntry({
    key: buildKey(organizationPublicId),
    ttlSeconds: CACHE_INVALIDATION_TOMBSTONE_TTL_SECONDS,
    metricName: ORGANIZATION_MFA_POLICY_METRIC,
  });
}
