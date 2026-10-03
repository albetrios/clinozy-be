import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { OrganizationSettingsRepository } from './organization-settings.repository.js';

const ORGANIZATION_MFA_POLICY_CACHE_PREFIX = 'organization:mfa-required';
/** Short on purpose: the policy is read on every organization-authorized request. */
const ORGANIZATION_MFA_POLICY_CACHE_TTL_SECONDS = 60;

const organizationSettingsRepository = new OrganizationSettingsRepository();

function buildKey(organizationPublicId: string): string {
  return `${ORGANIZATION_MFA_POLICY_CACHE_PREFIX}:${organizationPublicId}`;
}

/**
 * Whether the organization's security policy requires MFA (`security_policy.mfa_required === true`).
 *
 * @remarks
 * - **Algorithm:** Redis read-through cache (60 s) over the SECURITY DEFINER resolver
 *   `tenancy.organization_requires_mfa`; {@link invalidateOrganizationMfaPolicy} drops the entry
 *   when the organization's settings change, so a policy change applies on the next request.
 * - **Failure modes:** fails CLOSED — a Redis read error falls through to Postgres (never assumes
 *   "no MFA"); a Redis write error is logged and ignored; a database error propagates.
 * - **Side effects:** may write one Redis key.
 * - **Used by:** organization switch and refresh (auth service) and per-request organization
 *   authorization (`requireOrganizationPermission`), which admit an MFA-required organization only
 *   for a session that proved a second factor.
 */
export async function organizationRequiresMfa(organizationPublicId: string): Promise<boolean> {
  try {
    const cached = await redisConnection.get(buildKey(organizationPublicId));
    if (cached === 'true' || cached === 'false') return cached === 'true';
  } catch (error) {
    logger.warn({ error, organizationPublicId }, 'organization-mfa-policy.cache.get.failed');
  }
  const requiresMfa =
    await organizationSettingsRepository.organizationRequiresMfa(organizationPublicId);
  try {
    await redisConnection.set(
      buildKey(organizationPublicId),
      requiresMfa ? 'true' : 'false',
      'EX',
      ORGANIZATION_MFA_POLICY_CACHE_TTL_SECONDS,
    );
  } catch (error) {
    logger.warn({ error, organizationPublicId }, 'organization-mfa-policy.cache.set.failed');
  }
  return requiresMfa;
}

/**
 * Drops the cached MFA policy for an organization — called after its security policy changes so
 * the next request reads the new value instead of waiting for the TTL.
 *
 * @remarks
 * Best-effort: a Redis error is logged; the 60 s TTL bounds how long a stale value can survive.
 */
export async function invalidateOrganizationMfaPolicy(organizationPublicId: string): Promise<void> {
  try {
    await redisConnection.del(buildKey(organizationPublicId));
  } catch (error) {
    logger.warn({ error, organizationPublicId }, 'organization-mfa-policy.cache.invalidate.failed');
  }
}
