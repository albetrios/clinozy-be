import { type SQL, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  index,
  pgPolicy,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import {
  PHONE_NUMBER_PATTERN,
  CHIP_TONE_VALUES,
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
  WEEKDAY_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  BRANCH_DEFAULT_CLOSES_AT,
  BRANCH_DEFAULT_OPENS_AT,
  BRANCH_DEFAULT_STATE,
  BRANCH_DEFAULT_TONE,
  BRANCH_DEFAULT_WORKING_DAYS,
  BRANCH_GST_NUMBER_PATTERN,
  BRANCH_POSTAL_CODE_PATTERN,
} from './branches.constants.js';

/** `<column> IN ('a', 'b', …)` from a value list. */
function inList(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} IN (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;
}

/** A regex pattern constant as a quoted SQL literal. */
function pattern(value: string): SQL {
  return sql.raw(`'${value}'`);
}

/**
 * Drizzle table for `app.branches` — a location of an organization (launch ROUTE #2, domain `app`).
 * Holds the address, contact, GSTIN, opening hours and working days, the default staff per role
 * (memberships), the maps and review links, and a soft delete with its reason. One live main branch
 * per organization and live names unique per organization (case-insensitive). RLS is the
 * `branches_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm for the
 * deleted-record purge.
 */
export const branches = appSchema
  .table(
    'branches',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      name: varchar('name', { length: 60 }).notNull(),
      tone: varchar('tone', { length: 10 }).notNull().default(BRANCH_DEFAULT_TONE),
      is_main: boolean('is_main').notNull().default(false),
      address_line_one: varchar('address_line_one', { length: 120 }).notNull(),
      address_line_two: varchar('address_line_two', { length: 120 }),
      area: varchar('area', { length: 60 }).notNull(),
      city: varchar('city', { length: 60 }).notNull(),
      state: varchar('state', { length: 60 }).notNull().default(BRANCH_DEFAULT_STATE),
      postal_code: varchar('postal_code', { length: 6 }).notNull(),
      phone: varchar('phone', { length: 16 }).notNull(),
      email: varchar('email', { length: 120 }).notNull(),
      gst_number: varchar('gst_number', { length: 15 }),
      opens_at: time('opens_at').notNull().default(BRANCH_DEFAULT_OPENS_AT),
      closes_at: time('closes_at').notNull().default(BRANCH_DEFAULT_CLOSES_AT),
      working_days: text('working_days')
        .array()
        .notNull()
        .default([...BRANCH_DEFAULT_WORKING_DAYS]),
      // The staff a new booking or visit in this branch defaults to, per role. A membership is a
      // staff member (D5); the service checks the membership holds the role.
      default_doctor_membership_id: bigint('default_doctor_membership_id', {
        mode: 'number',
      }).references(() => memberships.id, { onDelete: 'set null' }),
      default_front_desk_membership_id: bigint('default_front_desk_membership_id', {
        mode: 'number',
      }).references(() => memberships.id, { onDelete: 'set null' }),
      default_therapist_membership_id: bigint('default_therapist_membership_id', {
        mode: 'number',
      }).references(() => memberships.id, { onDelete: 'set null' }),
      default_pharmacist_membership_id: bigint('default_pharmacist_membership_id', {
        mode: 'number',
      }).references(() => memberships.id, { onDelete: 'set null' }),
      is_active: boolean('is_active').notNull().default(true),
      maps_link: varchar('maps_link', { length: 512 }),
      review_link: varchar('review_link', { length: 512 }),
      deleted_at: timestamp('deleted_at', { withTimezone: true }),
      delete_reason: varchar('delete_reason', { length: 20 }),
      delete_note: varchar('delete_note', { length: 280 }),
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
      uniqueIndex('idx_branches_public_id').on(table.public_id),
      // Live names are unique per organization, ignoring case; a deleted branch frees its name.
      uniqueIndex('idx_branches_organization_name_unique')
        .on(table.organization_id, sql`lower(${table.name})`)
        .where(sql`${table.deleted_at} IS NULL`),
      // At most one live main branch per organization; "at least one" is the service's rule.
      uniqueIndex('idx_branches_one_main_per_organization')
        .on(table.organization_id)
        .where(sql`${table.is_main} AND ${table.deleted_at} IS NULL`),
      // Full (not partial): the organization delete cascade needs it, and the list query uses it.
      index('idx_branches_organization_id_name').on(table.organization_id, table.name),
      // The deleted-record purge (D38) scans deleted rows only.
      index('idx_branches_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_branches_default_doctor_membership_id')
        .on(table.default_doctor_membership_id)
        .where(sql`${table.default_doctor_membership_id} IS NOT NULL`),
      index('idx_branches_default_front_desk_membership_id')
        .on(table.default_front_desk_membership_id)
        .where(sql`${table.default_front_desk_membership_id} IS NOT NULL`),
      index('idx_branches_default_therapist_membership_id')
        .on(table.default_therapist_membership_id)
        .where(sql`${table.default_therapist_membership_id} IS NOT NULL`),
      index('idx_branches_default_pharmacist_membership_id')
        .on(table.default_pharmacist_membership_id)
        .where(sql`${table.default_pharmacist_membership_id} IS NOT NULL`),
      index('idx_branches_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_branches_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_branches_tone', inList(table.tone, CHIP_TONE_VALUES)),
      check(
        'chk_branches_postal_code',
        sql`${table.postal_code} ~ ${pattern(BRANCH_POSTAL_CODE_PATTERN)}`,
      ),
      check('chk_branches_phone', sql`${table.phone} ~ ${pattern(PHONE_NUMBER_PATTERN)}`),
      check(
        'chk_branches_gst_number',
        sql`${table.gst_number} ~ ${pattern(BRANCH_GST_NUMBER_PATTERN)}`,
      ),
      check('chk_branches_hours', sql`${table.closes_at} > ${table.opens_at}`),
      check(
        'chk_branches_working_days_allowed',
        sql`${table.working_days} <@ ARRAY[${sql.join(
          WEEKDAY_VALUES.map((weekday) => sql`${weekday}`),
          sql`, `,
        )}]::text[]`,
      ),
      check(
        'chk_branches_working_days_count',
        sql`cardinality(${table.working_days}) BETWEEN 1 AND ${sql.raw(String(WEEKDAY_VALUES.length))}`,
      ),
      check('chk_branches_maps_link', sql`${table.maps_link} ~ '^https://'`),
      check('chk_branches_review_link', sql`${table.review_link} ~ '^https://'`),
      check('chk_branches_delete_reason', inList(table.delete_reason, RECORD_DELETE_REASON_VALUES)),
      check(
        'chk_branches_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_branches_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      check('chk_branches_updated', sql`${table.updated_at} >= ${table.created_at}`),
      pgPolicy('branches_tenant_isolation', {
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
