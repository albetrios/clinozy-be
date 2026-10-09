import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  timestamp,
  jsonb,
  varchar,
  check,
  pgPolicy,
  index,
  integer,
  numeric,
  smallint,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { maintenanceBypassArm, tenancySchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import {
  ORGANIZATION_SETTINGS_DEFAULT_DAY_FLOAT,
  ORGANIZATION_SETTINGS_DEFAULT_DELETED_RECORD_PURGE_DAYS,
  ORGANIZATION_SETTINGS_DEFAULT_LEAD_HOLD_DAYS,
  ORGANIZATION_SETTINGS_DEFAULT_REMINDER_HOUR,
  ORGANIZATION_SETTINGS_DEFAULT_RETARGET_AFTER_DAYS,
} from './organization-settings.constants.js';

/**
 * Drizzle table for `tenancy.organization_settings` — 1:1 with
 * `tenancy.organizations` (PK = `organization_id`). Stores per-tenant
 * delivery toggles, default UI locale (constrained to `en`/`es`), and a
 * free-form `security_policy` JSONB used for MFA enforcement and similar
 * platform rules, and the operating settings the launch's rooms and background
 * work read (opening cash float, lead hold days, reminder hour, re-target
 * days, deleted-record purge days), and the clinic's WhatsApp and Instagram accounts on the
 * platform Meta app (launch D77 — unique, so a callback finds its one organization through
 * `tenancy.resolve_organization_public_id_for_messaging_account`). RLS is enforced by the
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
      // The clinic's messaging accounts on the platform Meta app (launch D77) — the WhatsApp
      // Business number's phone-number id and the Instagram account id; unset = not connected.
      whatsapp_phone_number_id: varchar('whatsapp_phone_number_id', { length: 32 }),
      instagram_account_id: varchar('instagram_account_id', { length: 32 }),
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
      // Attribution FK indexes (partial on IS NOT NULL) from migration 20260623000000 — declared so
      // the schema lists every index the database has (pinned by index-hygiene.integration.test.ts).
      index('idx_organization_settings_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_organization_settings_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      // One organization per messaging account — a callback names the account, never the clinic.
      uniqueIndex('idx_organization_settings_whatsapp_phone_number_id')
        .on(table.whatsapp_phone_number_id)
        .where(sql`${table.whatsapp_phone_number_id} IS NOT NULL`),
      uniqueIndex('idx_organization_settings_instagram_account_id')
        .on(table.instagram_account_id)
        .where(sql`${table.instagram_account_id} IS NOT NULL`),
      check(
        'chk_organization_settings_whatsapp_phone_number_id',
        sql`${table.whatsapp_phone_number_id} ~ '^[0-9]{5,32}$'`,
      ),
      check(
        'chk_organization_settings_instagram_account_id',
        sql`${table.instagram_account_id} ~ '^[0-9]{5,32}$'`,
      ),
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
