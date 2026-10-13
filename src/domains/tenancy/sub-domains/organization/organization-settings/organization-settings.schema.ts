import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  timestamp,
  jsonb,
  varchar,
  check,
  foreignKey,
  pgPolicy,
  index,
  integer,
  numeric,
  smallint,
  text,
} from 'drizzle-orm/pg-core';
import { maintenanceBypassArm, tenancySchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import {
  ORGANIZATION_SETTINGS_DEFAULT_DAY_FLOAT,
  ORGANIZATION_SETTINGS_DEFAULT_DELETED_RECORD_PURGE_DAYS,
  ORGANIZATION_SETTINGS_DEFAULT_LEAD_HOLD_DAYS,
  ORGANIZATION_SETTINGS_DEFAULT_REMINDER_HOUR,
  ORGANIZATION_SETTINGS_DEFAULT_RETARGET_AFTER_DAYS,
  ORGANIZATION_SETTINGS_SETUP_ANSWERED_STEP_VALUES,
  ORGANIZATION_SETTINGS_SETUP_SKIPPABLE_ITEM_VALUES,
} from './organization-settings.constants.js';

/**
 * Drizzle table for `tenancy.organization_settings` — 1:1 with
 * `tenancy.organizations` (PK = `organization_id`). Stores per-tenant
 * delivery toggles, default UI locale (constrained to `en`/`es`), and a
 * free-form `security_policy` JSONB used for MFA enforcement and similar
 * platform rules, and the operating settings the launch's rooms and background
 * work read (opening cash float, lead hold days, reminder hour, re-target
 * days, deleted-record purge days), and the clinic's setup progress (the answered setup steps, the
 * skipped guide items and when setup was deferred, completed and by whom, and when the guide was hidden
 * or first all done — feat-clinic-setup). RLS is enforced by the
 * `organization_settings_tenant_isolation` policy.
 */
export const organization_settings = tenancySchema
  .table(
    'organization_settings',
    {
      organization_id: bigint('organization_id', { mode: 'number' })
        .primaryKey()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      is_email_notifications_enabled: boolean('is_email_notifications_enabled')
        .notNull()
        .default(true),
      default_locale: varchar('default_locale', { length: 5 }).notNull().default('en'),
      security_policy: jsonb('security_policy').notNull().default({}),
      // The operating settings (launch D34, D35, D38 and the frontend's requests). A row is written
      // lazily (upsert), so a reader without one uses these same defaults from the constants.
      default_day_float: numeric('default_day_float', { precision: 12, scale: 2 })
        .notNull()
        .default(ORGANIZATION_SETTINGS_DEFAULT_DAY_FLOAT),
      lead_hold_days: integer('lead_hold_days')
        .notNull()
        .default(ORGANIZATION_SETTINGS_DEFAULT_LEAD_HOLD_DAYS),
      reminder_hour: smallint('reminder_hour')
        .notNull()
        .default(ORGANIZATION_SETTINGS_DEFAULT_REMINDER_HOUR),
      retarget_after_days: integer('retarget_after_days')
        .notNull()
        .default(ORGANIZATION_SETTINGS_DEFAULT_RETARGET_AFTER_DAYS),
      deleted_record_purge_days: integer('deleted_record_purge_days')
        .notNull()
        .default(ORGANIZATION_SETTINGS_DEFAULT_DELETED_RECORD_PURGE_DAYS),
      // The clinic's setup progress (feat-clinic-setup, routes-final §2.A.3). Only what has no record of
      // its own is stored; every tick is read from the clinic's records. Written only by the app's
      // onboarding-setup routes through the settings service — the settings routes never show them.
      setup_answered_steps: text('setup_answered_steps').array().notNull().default([]),
      setup_skipped_items: text('setup_skipped_items').array().notNull().default([]),
      setup_deferred_at: timestamp('setup_deferred_at', { withTimezone: true }),
      setup_completed_at: timestamp('setup_completed_at', { withTimezone: true }),
      setup_completed_by_membership_id: bigint('setup_completed_by_membership_id', {
        mode: 'number',
      }),
      setup_guide_hidden_at: timestamp('setup_guide_hidden_at', { withTimezone: true }),
      setup_guide_done_at: timestamp('setup_guide_done_at', { withTimezone: true }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
        { onDelete: 'set null' },
      ),
      updated_by_user_id: bigint('updated_by_user_id', { mode: 'number' }).references(
        () => users.id,
        { onDelete: 'set null' },
      ),
    },
    (table) => [
      // Attribution FK indexes (partial on IS NOT NULL) from migration 20260623000000 — declared so
      // the schema lists every index the database has (pinned by index-hygiene.integration.test.ts).
      index('idx_organization_settings_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_organization_settings_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_organization_settings_setup_completed_by_membership_id')
        .on(table.organization_id, table.setup_completed_by_membership_id)
        .where(sql`${table.setup_completed_by_membership_id} IS NOT NULL`),
      // K8: a member of this organization; K2: who took the clinic live stays.
      foreignKey({
        name: 'organization_settings_setup_completed_by_membership_fk',
        columns: [table.organization_id, table.setup_completed_by_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      check('chk_org_settings_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_organization_settings_default_locale',
        sql`${table.default_locale} IN ('en', 'es')`,
      ),
      // Structural bounds only; the business limits live in the settings validator.
      check('chk_organization_settings_default_day_float', sql`${table.default_day_float} >= 0`),
      check('chk_organization_settings_lead_hold_days', sql`${table.lead_hold_days} >= 1`),
      check(
        'chk_organization_settings_reminder_hour',
        sql`${table.reminder_hour} BETWEEN 0 AND 23`,
      ),
      check(
        'chk_organization_settings_retarget_after_days',
        sql`${table.retarget_after_days} >= 1`,
      ),
      check(
        'chk_organization_settings_deleted_record_purge_days',
        sql`${table.deleted_record_purge_days} >= 1`,
      ),
      check(
        'chk_organization_settings_setup_answered_steps',
        sql`${table.setup_answered_steps} <@ ARRAY[${sqlLiteralList(ORGANIZATION_SETTINGS_SETUP_ANSWERED_STEP_VALUES)}]::text[] AND cardinality(${table.setup_answered_steps}) <= ${sql.raw(String(ORGANIZATION_SETTINGS_SETUP_ANSWERED_STEP_VALUES.length))}`,
      ),
      check(
        'chk_organization_settings_setup_skipped_items',
        sql`${table.setup_skipped_items} <@ ARRAY[${sqlLiteralList(ORGANIZATION_SETTINGS_SETUP_SKIPPABLE_ITEM_VALUES)}]::text[] AND cardinality(${table.setup_skipped_items}) <= ${sql.raw(String(ORGANIZATION_SETTINGS_SETUP_SKIPPABLE_ITEM_VALUES.length))}`,
      ),
      check(
        'chk_organization_settings_setup_completed_by',
        sql`${table.setup_completed_by_membership_id} IS NULL OR ${table.setup_completed_at} IS NOT NULL`,
      ),
      pgPolicy('organization_settings_tenant_isolation', {
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
