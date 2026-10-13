import { NotFoundError } from '@/shared/errors/index.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
  type OrganizationPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';
import type { OrganizationRepository } from '@/domains/tenancy/sub-domains/organization/organization.repository.js';
import type { OrganizationSettingsRepository } from './organization-settings.repository.js';
import type {
  OrganizationDefaultLocale,
  OrganizationSettingsOutput,
  OrganizationSetupProgress,
  OrganizationSetupProgressChange,
} from './organization-settings.types.js';
import { validateUpdateOrganizationSettings } from './organization-settings.validator.js';
import { serializeOrganizationSettings } from './organization-settings.serializer.js';
import {
  getCachedOrganizationDefaultLocale,
  invalidateCachedOrganizationDefaultLocale,
  setCachedOrganizationDefaultLocale,
} from './i18n-locale.cache.js';
import { invalidateOrganizationMfaPolicy } from './organization-mfa-policy.js';

/**
 * Read/write service for the per-organization settings row plus two
 * unscoped helpers used during authentication.
 *
 * @remarks
 * - **Algorithm:** `get` and `update` take the token-minted
 *   {@link OrganizationPrincipalDatabaseScope} from the controller and run inside
 *   `withAppDatabaseContext` (RLS) — they lazily upsert the row when
 *   missing; `update` strips undefined fields with `omitUndefined` so PATCH
 *   semantics preserve unchanged columns.
 *   `resolveDefaultLocaleForOrganization` falls back to `'en'` when nothing
 *   is configured. `userHasOrganizationRequiringMfa` is delegated to the
 *   repository's unscoped query (no tenant context yet at login time).
 * - **Failure modes:** `NotFoundError('Organization')` when the parent
 *   organization is missing or invisible under RLS; validation errors
 *   propagate from {@link validateUpdateOrganizationSettings}.
 * - **Side effects:** `upsert` writes to `tenancy.organization_settings`;
 *   no events are emitted and no external I/O is performed.
 * - **Notes:** the locale and MFA helpers intentionally bypass tenant RLS
 *   because they run during login flow before the tenant cookie/header is
 *   resolved.
 */
export class OrganizationSettingsService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly settingsRepository: OrganizationSettingsRepository,
  ) {}

  async get(scope: OrganizationPrincipalDatabaseScope): Promise<OrganizationSettingsOutput> {
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization = await this.organizationRepository.findByPublicId(
          scope.organizationPublicId,
        );
        if (!organization) throw new NotFoundError('Organization');
        const settings = await this.settingsRepository.findByOrganizationId(organization.id);
        if (!settings) {
          const created = await this.settingsRepository.upsert(organization.id, {});
          return serializeOrganizationSettings({
            organization_public_id: organization.public_id,
            row: created,
          });
        }
        return serializeOrganizationSettings({
          organization_public_id: organization.public_id,
          row: settings,
        });
      },
    });
  }

  async update({
    scope,
    body,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    body: unknown;
  }): Promise<OrganizationSettingsOutput> {
    const parsed = validateUpdateOrganizationSettings(body);
    const result = await withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization = await this.organizationRepository.findByPublicId(
          scope.organizationPublicId,
        );
        if (!organization) throw new NotFoundError('Organization');
        const updated = await this.settingsRepository.upsert(
          organization.id,
          omitUndefined({
            is_email_notifications_enabled: parsed.is_email_notifications_enabled,
            default_locale: parsed.default_locale,
            security_policy: parsed.security_policy as object | undefined,
            default_day_float: parsed.default_day_float,
            lead_hold_days: parsed.lead_hold_days,
            reminder_hour: parsed.reminder_hour,
            retarget_after_days: parsed.retarget_after_days,
            deleted_record_purge_days: parsed.deleted_record_purge_days,
          }),
        );
        return serializeOrganizationSettings({
          organization_public_id: organization.public_id,
          row: updated,
        });
      },
    });
    // sec-M1: drop the i18n locale cache for the organization so a dashboard switch
    // is reflected in the next request rather than waiting for the TTL.
    // Outside the DB context (cache write must not roll back with the organization tx).
    if (parsed.default_locale !== undefined) {
      await invalidateCachedOrganizationDefaultLocale(scope.organizationPublicId);
    }
    // A security-policy change (e.g. turning `mfa_required` on) must apply to the next request,
    // not after the policy cache's TTL.
    if (parsed.security_policy !== undefined) {
      await invalidateOrganizationMfaPolicy(scope.organizationPublicId);
    }
    return result;
  }

  /**
   * The clinic's setup progress (feat-clinic-setup) — written only through this service, read by
   * the app's onboarding-setup sub-domain; never part of `GET`/`PATCH /tenancy/organization/settings`.
   *
   * @remarks
   * - **Algorithm:** in the organization's context, reads the settings row's `setup_*` fields with
   *   the completer's public id; creates the row (all defaults) when the clinic has none, as `get`.
   * - **Failure modes:** `NotFoundError('Organization')` for a missing organization.
   * - **Side effects:** may insert the clinic's settings row on first read.
   */
  async getSetupProgress(
    scope: OrganizationPrincipalDatabaseScope,
  ): Promise<OrganizationSetupProgress> {
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.requireOrganizationId(scope);
        return this.readSetupProgress(organizationId);
      },
    });
  }

  /**
   * Merges one change into the setup progress (feat-clinic-setup OS5) and returns the result.
   *
   * @remarks
   * - **Algorithm:** one `INSERT … ON CONFLICT DO UPDATE` — single values added to or removed from
   *   the stored lists, "Explore first" set once, the guide hidden or reopened — then a read back.
   * - **Failure modes:** `NotFoundError('Organization')`; a value outside the allowed lists is
   *   refused by the column checks (the caller validates first).
   * - **Side effects:** writes the settings row (created when missing) and its `updated_at`.
   */
  async changeSetupProgress(options: {
    scope: OrganizationPrincipalDatabaseScope;
    change: OrganizationSetupProgressChange;
    actingUserPublicId: string | undefined;
  }): Promise<OrganizationSetupProgress> {
    return withAppDatabaseContext({
      scope: options.scope,
      callback: async () => {
        const organizationId = await this.requireOrganizationId(options.scope);
        const userId = options.actingUserPublicId
          ? await this.organizationRepository.resolveUserIdByPublicId(options.actingUserPublicId)
          : null;
        await this.settingsRepository.mergeSetupProgress(organizationId, {
          ...options.change,
          updated_by_user_id: userId,
        });
        return this.readSetupProgress(organizationId);
      },
    });
  }

  /**
   * Takes the clinic live (feat-clinic-setup OS6) — once; a second call keeps the first time and
   * completer — and returns the progress.
   *
   * @remarks
   * - **Algorithm:** ensures the settings row, then a conditional update on
   *   `setup_completed_at IS NULL`; reads the progress back.
   * - **Failure modes:** `NotFoundError('Organization')`. The caller checks the live conditions.
   * - **Side effects:** sets `setup_completed_at` and `setup_completed_by_membership_id` once.
   */
  async completeSetup(options: {
    scope: OrganizationPrincipalDatabaseScope;
    membershipId: number | null;
  }): Promise<OrganizationSetupProgress> {
    return withAppDatabaseContext({
      scope: options.scope,
      callback: async () => {
        const organizationId = await this.requireOrganizationId(options.scope);
        await this.readSetupProgress(organizationId);
        await this.settingsRepository.completeSetup(organizationId, options.membershipId);
        return this.readSetupProgress(organizationId);
      },
    });
  }

  /**
   * Records the first time every guide item was done or skipped (feat-clinic-setup OS7) and returns
   * the progress; a later call never moves the time.
   *
   * @remarks
   * - **Algorithm:** a conditional update on `setup_guide_done_at IS NULL`, then a read back.
   * - **Failure modes:** `NotFoundError('Organization')`.
   * - **Side effects:** sets `setup_guide_done_at` once.
   */
  async markSetupGuideDone(
    scope: OrganizationPrincipalDatabaseScope,
  ): Promise<OrganizationSetupProgress> {
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.requireOrganizationId(scope);
        await this.settingsRepository.markSetupGuideDone(organizationId);
        return this.readSetupProgress(organizationId);
      },
    });
  }

  /** The active organization's internal id; `NotFoundError('Organization')` when it is missing. */
  private async requireOrganizationId(scope: OrganizationPrincipalDatabaseScope): Promise<number> {
    const organization = await this.organizationRepository.findByPublicId(
      scope.organizationPublicId,
    );
    if (!organization) throw new NotFoundError('Organization');
    return organization.id;
  }

  /** The setup progress, creating the clinic's settings row first when it has none. */
  private async readSetupProgress(organizationId: number): Promise<OrganizationSetupProgress> {
    const progress = await this.settingsRepository.findSetupProgress(organizationId);
    if (progress) return progress;
    await this.settingsRepository.ensureRow(organizationId);
    const created = await this.settingsRepository.findSetupProgress(organizationId);
    if (!created) throw new NotFoundError('Organization');
    return created;
  }

  async resolveDefaultLocaleForOrganization(
    organizationPublicId: string,
  ): Promise<OrganizationDefaultLocale> {
    /**
     * sec-M1: Redis cache short-circuits the SECURITY DEFINER DB call on every
     * pre-auth i18n preHandler hit. Without it, every unauthenticated request
     * authenticated without `Accept-Language`
     * triggers a DB round-trip — distributed attackers can drive thousands of
     * pre-auth lookups per second and use the differential response language
     * as an organization-existence oracle. The cache stores the canonical
     * `'en'` fallback too, so unknown ids stop hitting the DB after the first
     * lookup. Mutations to `default_locale` (via `update`) invalidate the
     * cache so a dashboard change is visible on the next request.
     */
    const cached = await getCachedOrganizationDefaultLocale(organizationPublicId);
    if (cached !== null) {
      return cached as OrganizationDefaultLocale;
    }
    const locale = await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: organizationPublicId }),
      callback: async () => {
        const found =
          await this.settingsRepository.findDefaultLocaleByOrganizationPublicId(
            organizationPublicId,
          );
        return found ?? 'en';
      },
    });
    await setCachedOrganizationDefaultLocale({ organizationPublicId, locale });
    return locale;
  }

  async userHasOrganizationRequiringMfa(userId: number): Promise<boolean> {
    return this.settingsRepository.userHasOrganizationRequiringMfa(userId);
  }
}
