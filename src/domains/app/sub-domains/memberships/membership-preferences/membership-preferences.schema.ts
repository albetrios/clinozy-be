import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  foreignKey,
  index,
  pgPolicy,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import {
  MEMBERSHIP_PREFERENCE_DEFAULTS,
  MEMBERSHIP_PREFERENCE_PATIENT_FILE_PINS_VALUES,
  MEMBERSHIP_PREFERENCE_PINNED_SECTIONS_MAX,
  MEMBERSHIP_PREFERENCE_PINNED_SECTIONS_VALUES,
  MEMBERSHIP_PREFERENCE_RECENT_PICKS_MAX,
  MEMBERSHIP_PREFERENCE_THEME_VALUES,
} from './membership-preferences.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.membership_preferences` — a member's own settings in the organization:
 * pinned sections, theme, patient-file pins, recent picks (launch §2.F; renamed from
 * `user_preferences` at ROUTE #127, U1/U4). One row per membership, upserted on `membership_id`;
 * no soft delete — the leave step deletes it (K4). The member pointer is composite
 * `(organization_id, membership_id)` (K8). RLS is the `membership_preferences_tenant_isolation`
 * policy on the organization GUC.
 */
export const membership_preferences = appSchema
  .table(
    'membership_preferences',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      membership_id: bigint('membership_id', { mode: 'number' }).notNull(),
      pinned_sections: text('pinned_sections')
        .array()
        .notNull()
        .default([...MEMBERSHIP_PREFERENCE_DEFAULTS.pinned_sections]),
      theme: varchar('theme', { length: 6 })
        .notNull()
        .default(MEMBERSHIP_PREFERENCE_DEFAULTS.theme),
      patient_file_pins: text('patient_file_pins')
        .array()
        .notNull()
        .default([...MEMBERSHIP_PREFERENCE_DEFAULTS.patient_file_pins]),
      // `room:field:value` entries, newest first, the newest 3 per `room:field`
      recent_picks: text('recent_picks').array().notNull().default([]),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
      updated_by_user_id: bigint('updated_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      // K8: a member of this organization; the membership purge cascades the row.
      foreignKey({
        name: 'membership_preferences_membership_fk',
        columns: [table.organization_id, table.membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('cascade'),
      uniqueIndex('idx_membership_preferences_public_id').on(table.public_id),
      // U4: one row per membership — the upsert's conflict target.
      uniqueIndex('idx_membership_preferences_membership_id_unique').on(table.membership_id),
      // Backs the organization key and the composite membership key.
      index('idx_membership_preferences_organization_id_membership_id').on(
        table.organization_id,
        table.membership_id,
      ),
      index('idx_membership_preferences_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_membership_preferences_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check(
        'chk_membership_preferences_pinned_sections',
        sql`${table.pinned_sections} <@ ARRAY[${joinValues(MEMBERSHIP_PREFERENCE_PINNED_SECTIONS_VALUES)}]::text[] AND cardinality(${table.pinned_sections}) <= ${sql.raw(String(MEMBERSHIP_PREFERENCE_PINNED_SECTIONS_MAX))}`,
      ),
      check(
        'chk_membership_preferences_theme',
        sql`${table.theme} IN (${joinValues(MEMBERSHIP_PREFERENCE_THEME_VALUES)})`,
      ),
      check(
        'chk_membership_preferences_patient_file_pins',
        sql`${table.patient_file_pins} <@ ARRAY[${joinValues(MEMBERSHIP_PREFERENCE_PATIENT_FILE_PINS_VALUES)}]::text[] AND cardinality(${table.patient_file_pins}) <= ${sql.raw(String(MEMBERSHIP_PREFERENCE_PATIENT_FILE_PINS_VALUES.length))}`,
      ),
      check(
        'chk_membership_preferences_recent_picks',
        sql`cardinality(${table.recent_picks}) <= ${sql.raw(String(MEMBERSHIP_PREFERENCE_RECENT_PICKS_MAX))}`,
      ),
      check('chk_membership_preferences_updated', sql`${table.updated_at} >= ${table.created_at}`),
      pgPolicy('membership_preferences_tenant_isolation', {
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

/**
 * Drizzle link table `app.membership_preference_branches` — the `branch_ids` of a member's
 * preferences, the header's branch filter (launch §2.F; renamed from `user_preference_branches` at
 * ROUTE #127, U4). One row per pair; removing either side removes the row. RLS on the organization
 * GUC.
 */
export const membership_preference_branches = appSchema
  .table(
    'membership_preference_branches',
    {
      membership_preference_id: bigint('membership_preference_id', { mode: 'number' }).notNull(),
      branch_id: bigint('branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'cascade' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      primaryKey({
        name: 'membership_preference_branches_pkey',
        columns: [table.membership_preference_id, table.branch_id],
      }),
      // Named here: the generated name passes Postgres's 63-character limit
      foreignKey({
        name: 'membership_preference_branches_membership_preference_id_fk',
        columns: [table.membership_preference_id],
        foreignColumns: [membership_preferences.id],
      }).onDelete('cascade'),
      index('idx_membership_preference_branches_branch_id').on(table.branch_id),
      index('idx_membership_preference_branches_organization_id').on(table.organization_id),
      pgPolicy('membership_preference_branches_tenant_isolation', {
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
