import type {
  OrganizationDefaultLocale,
  OrganizationSetupProgress,
  OrganizationSetupProgressChange,
} from './organization-settings.types.js';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { databaseNowTimestamp } from '@/shared/utils/infrastructure/database-timestamp.util.js';
import {
  getContextFreeDatabase,
  getRequestDatabase,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import { organization_settings } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';

/** BCP 47 locale tag persisted in `organization_settings.default_locale` (constrained to translated locales). */

/** The operating settings a write names (launch #1), money as the `numeric` string Drizzle writes. */
function operatingSettings(data: {
  default_day_float?: number;
  lead_hold_days?: number;
  reminder_hour?: number;
  retarget_after_days?: number;
  deleted_record_purge_days?: number;
}) {
  return {
    ...(data.default_day_float !== undefined && {
      default_day_float: data.default_day_float.toFixed(2),
    }),
    ...(data.lead_hold_days !== undefined && { lead_hold_days: data.lead_hold_days }),
    ...(data.reminder_hour !== undefined && { reminder_hour: data.reminder_hour }),
    ...(data.retarget_after_days !== undefined && {
      retarget_after_days: data.retarget_after_days,
    }),
    ...(data.deleted_record_purge_days !== undefined && {
      deleted_record_purge_days: data.deleted_record_purge_days,
    }),
  };
}

/** A `text[]` literal of `values` (`'{}'` when empty) — one bound parameter per value. */
function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`'{}'::text[]`;
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/** The distinct values of `values`, minus `without` — the stored form of a new row's list. */
function distinctWithout(values: readonly string[], without: readonly string[] = []): string[] {
  return [...new Set(values)]
    .filter((value) => !without.includes(value))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * A setup write's `updated_at`: now, but never before the row's `created_at` — a row another
 * request created after this transaction began would otherwise break `chk_org_settings_updated`
 * (`now()` is the transaction's start).
 */
const setupUpdatedAt = sql`greatest(now(), ${organization_settings.created_at})`;

/**
 * Drizzle data-access for `tenancy.organization_settings`. The `upsert`
 * primary path is keyed on `organization_id` (1:1 with the organization row). Two
 * helpers (`findDefaultLocaleByOrganizationPublicId`,
 * `userHasOrganizationRequiringMfa`) run during the authentication /
 * middleware phase, before any tenant GUC exists; because the underlying
 * tables are FORCE RLS, they delegate to `SECURITY DEFINER` resolvers
 * (`tenancy.resolve_organization_default_locale`,
 * `tenancy.user_has_organization_requiring_mfa`) which bypass RLS by
 * ownership. The accessor reuses an already-pinned transaction, avoiding a second
 * pooled checkout while the caller holds the first. A plain SELECT under the
 * non-superuser app role would match zero rows and silently disable
 * organization-mandated MFA.
 */
export class OrganizationSettingsRepository {
  /**
   * Login-time / middleware locale (no tenant HTTP context): resolve organization default BCP 47 tag.
   */
  async findDefaultLocaleByOrganizationPublicId(
    organizationPublicId: string,
  ): Promise<OrganizationDefaultLocale | null> {
    // `tenancy.organization_settings`/`organizations` are FORCE RLS and this runs with no
    // tenant GUC (login/middleware), so a plain SELECT under the non-superuser app role would
    // return 0 rows. Delegate to the SECURITY DEFINER resolver (RLS bypass by ownership).
    const rows = await getContextFreeDatabase().execute(
      sql`SELECT tenancy.resolve_organization_default_locale(${organizationPublicId}) AS default_locale`,
    );
    const resultRows = (
      Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
    ) as { default_locale: string | null }[];
    const locale = resultRows[0]?.default_locale ?? null;
    if (!locale) {
      return null;
    }
    return locale === 'es' ? 'es' : 'en';
  }

  async findByOrganizationId(organization_id: number) {
    const rows = await getRequestDatabase()
      .select()
      .from(organization_settings)
      .where(eq(organization_settings.organization_id, organization_id))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * The clinic's setup progress (feat-clinic-setup), with the public id of the member who took it
   * live; null when the clinic has no settings row yet.
   */
  async findSetupProgress(organization_id: number): Promise<OrganizationSetupProgress | null> {
    const rows = await getRequestDatabase()
      .select({
        answered_steps: organization_settings.setup_answered_steps,
        skipped_items: organization_settings.setup_skipped_items,
        deferred_at: organization_settings.setup_deferred_at,
        completed_at: organization_settings.setup_completed_at,
        completed_by_membership_public_id: memberships.public_id,
        guide_hidden_at: organization_settings.setup_guide_hidden_at,
        guide_done_at: organization_settings.setup_guide_done_at,
        updated_at: organization_settings.updated_at,
      })
      .from(organization_settings)
      .leftJoin(
        memberships,
        and(
          eq(memberships.organization_id, organization_settings.organization_id),
          eq(memberships.id, organization_settings.setup_completed_by_membership_id),
        ),
      )
      .where(eq(organization_settings.organization_id, organization_id))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Creates the clinic's settings row with every default when it has none, and changes nothing when
   * it has one — never an update, so two first reads at once cannot collide (feat-clinic-setup).
   */
  async ensureRow(organization_id: number): Promise<void> {
    await getRequestDatabase()
      .insert(organization_settings)
      .values({ organization_id })
      .onConflictDoNothing({ target: organization_settings.organization_id });
  }

  /**
   * Merges one change into the setup progress in a single statement (feat-clinic-setup OS5): lists
   * gain or lose single values against what is stored at that moment, so two admins answering at
   * once never lose each other's answers; "Explore first" is set once; hiding sets or clears its
   * time. Creates the settings row when the clinic has none.
   */
  async mergeSetupProgress(
    organization_id: number,
    change: OrganizationSetupProgressChange & { updated_by_user_id?: number | null },
  ): Promise<void> {
    const answeredAdd = change.answered_steps_add ?? [];
    const skippedAdd = change.skipped_items_add ?? [];
    const skippedRemove = change.skipped_items_remove ?? [];
    // Hiding stamps the time, reopening clears it; left alone, the column is not written.
    let hidden: SQL | null | undefined;
    if (change.guide_hidden !== undefined)
      hidden = change.guide_hidden ? databaseNowTimestamp : null;
    await getRequestDatabase()
      .insert(organization_settings)
      .values({
        organization_id,
        setup_answered_steps: distinctWithout(answeredAdd),
        setup_skipped_items: distinctWithout(skippedAdd, skippedRemove),
        ...(change.deferred && { setup_deferred_at: databaseNowTimestamp }),
        ...(hidden !== undefined && { setup_guide_hidden_at: hidden }),
        updated_by_user_id: change.updated_by_user_id ?? undefined,
      })
      .onConflictDoUpdate({
        target: organization_settings.organization_id,
        set: {
          ...(answeredAdd.length > 0 && {
            setup_answered_steps: sql`ARRAY(SELECT DISTINCT element FROM unnest(${organization_settings.setup_answered_steps} || ${textArray(answeredAdd)}) AS element ORDER BY element)`,
          }),
          ...((skippedAdd.length > 0 || skippedRemove.length > 0) && {
            setup_skipped_items: sql`ARRAY(SELECT DISTINCT element FROM unnest(${organization_settings.setup_skipped_items} || ${textArray(skippedAdd)}) AS element WHERE element <> ALL (${textArray(skippedRemove)}) ORDER BY element)`,
          }),
          ...(change.deferred && {
            setup_deferred_at: sql`coalesce(${organization_settings.setup_deferred_at}, now())`,
          }),
          ...(hidden !== undefined && { setup_guide_hidden_at: hidden }),
          updated_at: setupUpdatedAt,
          updated_by_user_id: change.updated_by_user_id ?? undefined,
        },
      });
  }

  /**
   * Takes the clinic live once (feat-clinic-setup OS6): sets the time and the member only while no
   * time is set, so the first completer stays recorded. Returns whether this call set it.
   */
  async completeSetup(organization_id: number, membership_id: number | null): Promise<boolean> {
    const rows = await getRequestDatabase()
      .update(organization_settings)
      .set({
        setup_completed_at: databaseNowTimestamp,
        setup_completed_by_membership_id: membership_id,
        updated_at: setupUpdatedAt,
      })
      .where(
        and(
          eq(organization_settings.organization_id, organization_id),
          isNull(organization_settings.setup_completed_at),
        ),
      )
      .returning({ organization_id: organization_settings.organization_id });
    return rows.length > 0;
  }

  /**
   * Records the first time all three guide items were done or skipped (feat-clinic-setup OS7);
   * never moves an earlier time. Returns whether this call set it.
   */
  async markSetupGuideDone(organization_id: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .update(organization_settings)
      .set({ setup_guide_done_at: databaseNowTimestamp })
      .where(
        and(
          eq(organization_settings.organization_id, organization_id),
          isNull(organization_settings.setup_guide_done_at),
        ),
      )
      .returning({ organization_id: organization_settings.organization_id });
    return rows.length > 0;
  }

  async upsert(
    organization_id: number,
    data: {
      is_email_notifications_enabled?: boolean;
      default_locale?: OrganizationDefaultLocale;
      security_policy?: object;
      default_day_float?: number;
      lead_hold_days?: number;
      reminder_hour?: number;
      retarget_after_days?: number;
      deleted_record_purge_days?: number;
      updated_by_user_id?: number | null;
    },
  ) {
    const row = {
      organization_id,
      is_email_notifications_enabled: data.is_email_notifications_enabled ?? true,
      default_locale: data.default_locale ?? 'en',
      security_policy: data.security_policy ?? {},
      ...operatingSettings(data),
      updated_by_user_id: data.updated_by_user_id ?? undefined,
    };
    const rows = await getRequestDatabase()
      .insert(organization_settings)
      .values(row)
      .onConflictDoUpdate({
        target: organization_settings.organization_id,
        set: {
          ...(data.is_email_notifications_enabled !== undefined && {
            is_email_notifications_enabled: data.is_email_notifications_enabled,
          }),
          // audit #11: MERGE the incoming security_policy keys into the existing JSONB instead of a
          // whole-object replace. A wholesale replace made two concurrent PATCHes last-writer-wins,
          // so one admin enabling organization-mandated MFA could be silently reverted by another admin
          // editing an unrelated key. `||` composes: incoming keys win on overlap, untouched keys
          // are preserved. To remove a key, set it explicitly (e.g. `{mfa_required: false}`).
          ...(data.security_policy !== undefined && {
            security_policy: sql`coalesce(${organization_settings.security_policy}, '{}'::jsonb) || excluded.security_policy`,
          }),
          ...(data.default_locale !== undefined && { default_locale: data.default_locale }),
          ...operatingSettings(data),
          updated_at: databaseNowTimestamp,
          updated_by_user_id: data.updated_by_user_id ?? undefined,
        },
      })
      .returning();
    return rows[0]!;
  }

  /**
   * Login-time check (no tenant HTTP context): true when the user belongs to an active
   * membership in an organization whose security_policy requires MFA.
   */
  async userHasOrganizationRequiringMfa(userId: number): Promise<boolean> {
    // `tenancy.memberships`/`organization_settings` are FORCE RLS and this runs at login with
    // no tenant/user GUC, so a plain JOIN under the non-superuser app role would return 0 rows
    // and silently disable organization-mandated MFA in production. Delegate to the SECURITY DEFINER
    // resolver (RLS bypass by ownership), which encodes the strict `mfa_required === true` check.
    const rows = await getContextFreeDatabase().execute(
      sql`SELECT tenancy.user_has_organization_requiring_mfa(${userId}) AS requires_mfa`,
    );
    const resultRows = (
      Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
    ) as { requires_mfa: boolean | null }[];
    return resultRows[0]?.requires_mfa === true;
  }

  /**
   * Organization switch / refresh / per-request authorization (no tenant GUC for the caller yet):
   * true when the organization's security_policy requires MFA. Same strict `mfa_required === true`
   * check, through the SECURITY DEFINER resolver `tenancy.organization_requires_mfa` — the
   * settings and organizations tables are FORCE RLS.
   */
  async organizationRequiresMfa(organizationPublicId: string): Promise<boolean> {
    const rows = await getContextFreeDatabase().execute(
      sql`SELECT tenancy.organization_requires_mfa(${organizationPublicId}) AS requires_mfa`,
    );
    const resultRows = (
      Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
    ) as { requires_mfa: boolean | null }[];
    return resultRows[0]?.requires_mfa === true;
  }
}
