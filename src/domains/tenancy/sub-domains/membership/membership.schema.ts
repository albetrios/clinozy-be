import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  integer,
  numeric,
  text,
  time,
  varchar,
  timestamp,
  index,
  uniqueIndex,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { maintenanceBypassArm, tenancySchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import {
  DEFAULT_WORKING_DAYS,
  PHONE_NUMBER_PATTERN,
  CHIP_TONE_VALUES,
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
  WEEKDAY_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  MEMBERSHIP_COMMISSION_PERCENT_MAX,
  MEMBERSHIP_DEFAULT_TONE,
  MEMBERSHIP_DEFAULT_WORK_ENDS_AT,
  MEMBERSHIP_DEFAULT_WORK_STARTS_AT,
} from '@/domains/tenancy/sub-domains/membership/membership.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]) {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * `tenancy.memberships` table — links a user to an organization with a role
 * and a lifecycle `status` (INVITED, ACTIVE, SUSPENDED, enforced by
 * `chk_memberships_status`). A partial unique index keeps `(user_id,
 * organization_id)` unique only for active rows so a user can rejoin after
 * being soft-deleted. RLS scopes rows to the caller's organization.
 */
export const memberships = tenancySchema
  .table(
    'memberships',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      user_id: bigint('user_id', { mode: 'number' })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      role_id: bigint('role_id', { mode: 'number' })
        .notNull()
        .references(() => roles.id, { onDelete: 'restrict' }),
      status: varchar('status', { length: 20 }).notNull().default('INVITED'),
      invited_by_user_id: bigint('invited_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
      joined_at: timestamp('joined_at', { withTimezone: true }),
      deleted_at: timestamp('deleted_at', { withTimezone: true }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
      updated_by_user_id: bigint('updated_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
      // ── Staff profile (launch ROUTE #4, D3) ──
      // The "#12" number of the team table: per organization, never reused. A row inserted with 0
      // gets the next number from `trg_memberships_staff_number` (fn_assign_membership_staff_number,
      // serialized per organization by an advisory lock), so every insert path is covered.
      staff_number: integer('staff_number').notNull().default(0),
      phone: varchar('phone', { length: 16 }),
      tone: varchar('tone', { length: 10 }).notNull().default(MEMBERSHIP_DEFAULT_TONE),
      working_days: text('working_days')
        .array()
        .notNull()
        .default([...DEFAULT_WORKING_DAYS]),
      work_starts_at: time('work_starts_at').notNull().default(MEMBERSHIP_DEFAULT_WORK_STARTS_AT),
      work_ends_at: time('work_ends_at').notNull().default(MEMBERSHIP_DEFAULT_WORK_ENDS_AT),
      commission_percent: numeric('commission_percent', { precision: 5, scale: 2 })
        .notNull()
        .default('0'),
      // Why a manager removed the member (`DELETE …?reason=&note=`); other soft deletes (leave,
      // account deletion) carry none, so a reason implies a delete but not the other way round.
      delete_reason: varchar('delete_reason', { length: 20 }),
      delete_note: varchar('delete_note', { length: 280 }),
    },
    (table) => [
      // Attribution FK indexes (partial on IS NOT NULL) from migration 20260623000000 — declared so
      // the schema lists every index the database has (pinned by index-hygiene.integration.test.ts).
      index('idx_memberships_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_memberships_invited_by_user_id')
        .on(table.invited_by_user_id)
        .where(sql`${table.invited_by_user_id} IS NOT NULL`),
      index('idx_memberships_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      uniqueIndex('idx_memberships_public_id').on(table.public_id),
      index('idx_memberships_user_org').on(table.user_id, table.organization_id),
      index('idx_memberships_org_status').on(table.organization_id, table.status),
      index('idx_memberships_org_created_id_active')
        .on(table.organization_id, table.created_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_memberships_user_status').on(table.user_id, table.status),
      index('idx_memberships_role').on(table.role_id),
      uniqueIndex('idx_memberships_user_org_unique')
        .on(table.user_id, table.organization_id)
        .where(sql`${table.deleted_at} IS NULL`),
      check('chk_memberships_status', sql`${table.status} IN ('INVITED', 'ACTIVE', 'SUSPENDED')`),
      check(
        'chk_memberships_joined',
        sql`${table.status} != 'ACTIVE' OR ${table.joined_at} IS NOT NULL`,
      ),
      check('chk_memberships_updated', sql`${table.updated_at} >= ${table.created_at}`),
      uniqueIndex('idx_memberships_organization_staff_number').on(
        table.organization_id,
        table.staff_number,
      ),
      check('chk_memberships_staff_number', sql`${table.staff_number} > 0`),
      check('chk_memberships_phone', sql`${table.phone} ~ ${sql.raw(`'${PHONE_NUMBER_PATTERN}'`)}`),
      check('chk_memberships_tone', sql`${table.tone} IN (${joinValues(CHIP_TONE_VALUES)})`),
      check(
        'chk_memberships_working_days_allowed',
        sql`${table.working_days} <@ ARRAY[${joinValues(WEEKDAY_VALUES)}]::text[]`,
      ),
      check(
        'chk_memberships_working_days_count',
        sql`cardinality(${table.working_days}) BETWEEN 1 AND ${sql.raw(String(WEEKDAY_VALUES.length))}`,
      ),
      check('chk_memberships_work_hours', sql`${table.work_ends_at} > ${table.work_starts_at}`),
      check(
        'chk_memberships_commission_percent',
        sql`${table.commission_percent} BETWEEN 0 AND ${sql.raw(String(MEMBERSHIP_COMMISSION_PERCENT_MAX))}`,
      ),
      check(
        'chk_memberships_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_memberships_delete_reason_when_deleted',
        sql`${table.delete_reason} IS NULL OR ${table.deleted_at} IS NOT NULL`,
      ),
      check(
        'chk_memberships_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('memberships_tenant_isolation', {
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
