import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  foreignKey,
  index,
  integer,
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
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  LEAD_INTERESTS_VALUES,
  LEAD_KIND_VALUES,
  LEAD_NOTES_MAX,
  LEAD_CLOSED_STATUS_VALUES,
  LEAD_OPEN_STATUS_VALUES,
  LEAD_SOURCE_VALUES,
  LEAD_STATUS_VALUES,
} from '@/domains/app/sub-domains/leads/leads.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.leads` — one enquiry and its working state for a contact: status, source,
 * interests, owner and hold, follow-up (launch ROUTE #14, rebuilt at #131 — routes-final §5).
 *
 * @remarks
 * - **Notes:** the person lives on the contact (L1, `ON DELETE RESTRICT`); one open lead per contact
 *   (L6, the partial unique index); `lead_number` from the organization's counter
 *   (`trg_leads_lead_number`); the owner is a composite key into the organization's memberships
 *   that clears only itself when they go (K8). RLS is the organization policy with the
 *   retention-cleanup arm for the deleted-record purge; branch visibility is the service's (D9).
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
      contact_id: bigint('contact_id', { mode: 'number' })
        .notNull()
        .references(() => contacts.id, { onDelete: 'restrict' }),
      status: varchar('status', { length: 21 }).notNull().default('new'),
      source: varchar('source', { length: 9 }),
      interests: text('interests').array().notNull().default([]),
      // Server-set: an enquiry, or a re-target lead the task rules open (sub-domain 10)
      kind: varchar('kind', { length: 8 }).notNull().default('enquiry'),
      retarget_reason: varchar('retarget_reason', { length: 160 }),
      // Assigned — the owner holds it until `held_until` (D40)
      owner_membership_id: bigint('owner_membership_id', { mode: 'number' }),
      held_until: timestamp('held_until', { withTimezone: true }),
      follow_up_at: timestamp('follow_up_at', { withTimezone: true }),
      // When it last entered a closing status — set exactly while closed (D10); a check-in reads it
      closed_at: timestamp('closed_at', { withTimezone: true }),
      // Where it is handled — none = every branch
      branch_id: bigint('branch_id', { mode: 'number' }).references(() => branches.id, {
        onDelete: 'set null',
      }),
      notes: text('notes'),
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
      uniqueIndex('idx_leads_organization_lead_number').on(
        table.organization_id,
        table.lead_number,
      ),
      // L6: one open lead per contact
      uniqueIndex('idx_leads_organization_contact_open_unique')
        .on(table.organization_id, table.contact_id)
        .where(
          sql`${table.deleted_at} IS NULL AND ${table.status} IN (${joinValues(LEAD_OPEN_STATUS_VALUES)})`,
        ),
      index('idx_leads_organization_created')
        .on(table.organization_id, table.created_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      // "Mine"
      index('idx_leads_organization_owner_created').on(
        table.organization_id,
        table.owner_membership_id,
        table.created_at,
        table.id,
      ),
      index('idx_leads_organization_follow_up_at')
        .on(table.organization_id, table.follow_up_at, table.id)
        .where(sql`${table.deleted_at} IS NULL AND ${table.follow_up_at} IS NOT NULL`),
      // "Releasing today"
      index('idx_leads_organization_held_until')
        .on(table.organization_id, table.held_until)
        .where(sql`${table.deleted_at} IS NULL AND ${table.held_until} IS NOT NULL`),
      index('idx_leads_branch_id').on(table.branch_id),
      index('idx_leads_interests_gin')
        .using('gin', table.interests)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_leads_contact_id').on(table.contact_id),
      index('idx_leads_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_leads_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_leads_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      // K8: a member of this organization; the database clears only this column when the
      // membership row goes (`ON DELETE SET NULL ("owner_membership_id")`).
      foreignKey({
        name: 'leads_owner_membership_fk',
        columns: [table.organization_id, table.owner_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('set null'),
      check('chk_leads_lead_number', sql`${table.lead_number} > 0`),
      check('chk_leads_status', sql`${table.status} IN (${joinValues(LEAD_STATUS_VALUES)})`),
      check(
        'chk_leads_closed_at',
        sql`(${table.status} IN (${joinValues(LEAD_CLOSED_STATUS_VALUES)})) = (${table.closed_at} IS NOT NULL)`,
      ),
      check('chk_leads_source', sql`${table.source} IN (${joinValues(LEAD_SOURCE_VALUES)})`),
      check(
        'chk_leads_interests',
        sql`${table.interests} <@ ARRAY[${joinValues(LEAD_INTERESTS_VALUES)}]::text[] AND cardinality(${table.interests}) <= ${sql.raw(String(LEAD_INTERESTS_VALUES.length))}`,
      ),
      check('chk_leads_kind', sql`${table.kind} IN (${joinValues(LEAD_KIND_VALUES)})`),
      check(
        'chk_leads_retarget_reason',
        sql`${table.kind} = 'retarget' OR ${table.retarget_reason} IS NULL`,
      ),
      check(
        'chk_leads_held_until_owner',
        sql`${table.held_until} IS NULL OR ${table.owner_membership_id} IS NOT NULL`,
      ),
      check(
        'chk_leads_notes',
        sql`char_length(${table.notes}) <= ${sql.raw(String(LEAD_NOTES_MAX))}`,
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
 * Drizzle link table `app.lead_involved_memberships` — who else works a lead (L2, up to 10). The
 * member side is a composite key into the organization's memberships, kept when they leave (K2,
 * K8); deleting the lead removes the rows. RLS on the organization GUC.
 */
export const lead_involved_memberships = appSchema
  .table(
    'lead_involved_memberships',
    {
      lead_id: bigint('lead_id', { mode: 'number' })
        .notNull()
        .references(() => leads.id, { onDelete: 'cascade' }),
      membership_id: bigint('membership_id', { mode: 'number' }).notNull(),
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
        columns: [table.lead_id, table.membership_id],
      }),
      foreignKey({
        name: 'lead_involved_memberships_membership_fk',
        columns: [table.organization_id, table.membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      // The team filter (owner or involved) and the composite key's lookups
      index('idx_lead_involved_memberships_organization_id_membership_id').on(
        table.organization_id,
        table.membership_id,
        table.lead_id,
      ),
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
