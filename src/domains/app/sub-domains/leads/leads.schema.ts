import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
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
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import {
  PHONE_NUMBER_PATTERN,
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  LEAD_STATUS_VALUES,
  LEAD_SOURCE_VALUES,
  LEAD_INTERESTS_VALUES,
  LEAD_KIND_VALUES,
  LEAD_DEFAULT_CHANNEL_VALUES,
} from '@/domains/app/sub-domains/leads/leads.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.leads` — An enquiry and its conversation until the person becomes a patient (launch ROUTE #14, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `leads_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const leads = appSchema
  .table(
    'leads',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // The "#2371" of the lead list — per organization, never reused
      lead_number: integer('lead_number').notNull().default(0),
      name: varchar('name', { length: 120 }).notNull(),
      phone: varchar('phone', { length: 16 }).notNull(),
      email: varchar('email', { length: 254 }),
      // null only on a contact thread
      status: varchar('status', { length: 14 }).default('new'),
      source: varchar('source', { length: 9 }),
      interests: text('interests').array().notNull().default([]),
      // Assigned
      owner_membership_id: bigint('owner_membership_id', { mode: 'number' }).references(
        () => memberships.id,
        { onDelete: 'set null' },
      ),
      follow_up_at: timestamp('follow_up_at', { withTimezone: true }),
      branch_id: bigint('branch_id', { mode: 'number' }).references(() => branches.id, {
        onDelete: 'set null',
      }),
      patient_id: bigint('patient_id', { mode: 'number' }).references(
        (): AnyPgColumn => patients.id,
        { onDelete: 'set null' },
      ),
      // A hidden thread an appointment opened for a non-lead — never in a lead list
      is_contact_thread: boolean('is_contact_thread').notNull().default(false),
      kind: varchar('kind', { length: 14 }).notNull().default('enquiry'),
      retarget_reason: varchar('retarget_reason', { length: 160 }),
      notes: text('notes'),
      last_touch_at: timestamp('last_touch_at', { withTimezone: true }),
      phones: text('phones').array().notNull().default([]),
      instagram_handles: text('instagram_handles').array().notNull().default([]),
      default_channel: varchar('default_channel', { length: 9 }),
      preferences: jsonb('preferences').notNull().default({}),
      household: varchar('household', { length: 240 }),
      // The owner's hold — open to the team after it (D40)
      held_until: timestamp('held_until', { withTimezone: true }),
      // What `q` searches — one trigram-indexed column (schema review H5).
      search_text: text('search_text').generatedAlwaysAs(
        sql`"name" || ' ' || "phone" || ' ' || coalesce("email", '')`,
      ),
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
      uniqueIndex('idx_leads_public_id').on(table.public_id),
      index('idx_leads_organization_created').on(table.organization_id, table.created_at, table.id),
      index('idx_leads_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_leads_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_leads_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_leads_organization_name')
        .on(table.organization_id, table.name, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_leads_owner_membership_id')
        .on(table.owner_membership_id)
        .where(sql`${table.owner_membership_id} IS NOT NULL`),
      index('idx_leads_organization_follow_up_at')
        .on(table.organization_id, table.follow_up_at, table.id)
        .where(sql`${table.deleted_at} IS NULL AND ${table.follow_up_at} IS NOT NULL`),
      index('idx_leads_branch_id').on(table.branch_id).where(sql`${table.branch_id} IS NOT NULL`),
      index('idx_leads_patient_id')
        .on(table.patient_id)
        .where(sql`${table.patient_id} IS NOT NULL`),
      index('idx_leads_organization_last_touch_at')
        .on(table.organization_id, table.last_touch_at, table.id)
        .where(sql`${table.deleted_at} IS NULL AND ${table.last_touch_at} IS NOT NULL`),
      index('idx_leads_search_text_trgm')
        .using('gin', table.search_text.op('gin_trgm_ops'))
        .where(sql`${table.deleted_at} IS NULL`),
      uniqueIndex('idx_leads_organization_lead_number').on(
        table.organization_id,
        table.lead_number,
      ),
      check('chk_leads_lead_number', sql`${table.lead_number} > 0`),
      check('chk_leads_phone', sql`${table.phone} ~ ${sql.raw(`'${PHONE_NUMBER_PATTERN}'`)}`),
      check('chk_leads_status', sql`${table.status} IN (${joinValues(LEAD_STATUS_VALUES)})`),
      check('chk_leads_source', sql`${table.source} IN (${joinValues(LEAD_SOURCE_VALUES)})`),
      check(
        'chk_leads_interests',
        sql`${table.interests} <@ ARRAY[${joinValues(LEAD_INTERESTS_VALUES)}]::text[]`,
      ),
      check('chk_leads_kind', sql`${table.kind} IN (${joinValues(LEAD_KIND_VALUES)})`),
      check(
        'chk_leads_default_channel',
        sql`${table.default_channel} IN (${joinValues(LEAD_DEFAULT_CHANNEL_VALUES)})`,
      ),
      check('chk_leads_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_leads_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_leads_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_leads_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('leads_tenant_isolation', {
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
 * Drizzle link table `app.lead_involved_memberships` — the `involved_membership_ids` of an lead (launch ROUTE #14).
 * One row per pair; removing either side removes the row. RLS on the organization GUC.
 */
export const lead_involved_memberships = appSchema
  .table(
    'lead_involved_memberships',
    {
      lead_id: bigint('lead_id', { mode: 'number' })
        .notNull()
        .references(() => leads.id, { onDelete: 'cascade' }),
      involved_membership_id: bigint('involved_membership_id', { mode: 'number' })
        .notNull()
        .references(() => memberships.id, { onDelete: 'cascade' }),
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
        name: 'lead_involved_memberships_pkey',
        columns: [table.lead_id, table.involved_membership_id],
      }),
      index('idx_lead_involved_memberships_involved_membership_id').on(
        table.involved_membership_id,
      ),
      index('idx_lead_involved_memberships_organization_id').on(table.organization_id),
      index('idx_lead_involved_memberships_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('lead_involved_memberships_tenant_isolation', {
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
