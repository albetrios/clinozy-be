import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  pgPolicy,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  USER_PREFERENCE_PINNED_SECTIONS_VALUES,
  USER_PREFERENCE_THEME_VALUES,
  USER_PREFERENCE_PATIENT_FILE_PINS_VALUES,
} from '@/domains/app/sub-domains/user-preferences/user-preferences.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.user_preferences` — A person's own settings in an organization — pinned sections, branch filter, theme, recent picks (launch ROUTE #8, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `user_preferences_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const user_preferences = appSchema
  .table(
    'user_preferences',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      pinned_sections: text('pinned_sections')
        .array()
        .notNull()
        .default(['appointments', 'leads', 'patients', 'payments']),
      theme: varchar('theme', { length: 6 }).notNull().default('light'),
      patient_file_pins: text('patient_file_pins')
        .array()
        .notNull()
        .default(['overview', 'prescriptions', 'treatments', 'images', 'invoices']),
      // `room:fieldLabel:value` entries, last 3 per key
      recent_picks: text('recent_picks').array().notNull().default([]),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
      updated_by_user_id: bigint('updated_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
      deleted_at: timestamp('deleted_at', { withTimezone: true }),
      delete_reason: varchar('delete_reason', { length: 20 }),
      delete_note: varchar('delete_note', { length: 280 }),
    },
    (table) => [
      uniqueIndex('idx_user_preferences_public_id').on(table.public_id),
      index('idx_user_preferences_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_user_preferences_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_user_preferences_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_user_preferences_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      uniqueIndex('idx_user_preferences_organization_user_unique')
        .on(table.organization_id, table.created_by_user_id)
        .where(sql`${table.deleted_at} IS NULL`),
      check(
        'chk_user_preferences_pinned_sections',
        sql`${table.pinned_sections} <@ ARRAY[${joinValues(USER_PREFERENCE_PINNED_SECTIONS_VALUES)}]::text[]`,
      ),
      check(
        'chk_user_preferences_theme',
        sql`${table.theme} IN (${joinValues(USER_PREFERENCE_THEME_VALUES)})`,
      ),
      check(
        'chk_user_preferences_patient_file_pins',
        sql`${table.patient_file_pins} <@ ARRAY[${joinValues(USER_PREFERENCE_PATIENT_FILE_PINS_VALUES)}]::text[]`,
      ),
      check('chk_user_preferences_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_user_preferences_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_user_preferences_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_user_preferences_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('user_preferences_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR ${maintenanceBypassArm('app.global_retention_cleanup')}`,
        withCheck: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`,
      }),
    ],
  )
  .enableRLS();

/**
 * Drizzle link table `app.user_preference_branches` — the `branch_filter_ids` of an user preference (launch ROUTE #8).
 * One row per pair; removing either side removes the row. RLS on the organization GUC.
 */
export const user_preference_branches = appSchema
  .table(
    'user_preference_branches',
    {
      user_preference_id: bigint('user_preference_id', { mode: 'number' })
        .notNull()
        .references(() => user_preferences.id, { onDelete: 'cascade' }),
      branch_filter_id: bigint('branch_filter_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'cascade' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      primaryKey({
        name: 'user_preference_branches_pkey',
        columns: [table.user_preference_id, table.branch_filter_id],
      }),
      index('idx_user_preference_branches_branch_filter_id').on(table.branch_filter_id),
      index('idx_user_preference_branches_organization_id').on(table.organization_id),
      index('idx_user_preference_branches_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('user_preference_branches_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`,
        withCheck: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`,
      }),
    ],
  )
  .enableRLS();
