import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  numeric,
  pgPolicy,
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
  DAY_CLOSE_STATUS_VALUES,
  DAY_CLOSE_OPENING_SOURCE_VALUES,
} from '@/domains/app/sub-domains/day-closes/day-closes.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.day_closes` — A branch's day — the opening cash accepted, then the count and the close (launch ROUTE #38, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `day_closes_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const day_closes = appSchema
  .table(
    'day_closes',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      branch_id: bigint('branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'no action' }),
      close_date: date('close_date', { mode: 'string' }).notNull(),
      status: varchar('status', { length: 6 }).notNull().default('open'),
      opening_cash: numeric('opening_cash', { precision: 12, scale: 2 }).notNull(),
      opening_source: varchar('opening_source', { length: 13 }).notNull().default('carried'),
      opening_accepted_at: timestamp('opening_accepted_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
      counted_cash: numeric('counted_cash', { precision: 12, scale: 2 }),
      closed_at: timestamp('closed_at', { withTimezone: true }),
      difference_reason: varchar('difference_reason', { length: 280 }),
      reopened_at: timestamp('reopened_at', { withTimezone: true }),
      is_auto_closed: boolean('is_auto_closed').notNull().default(false),
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
      uniqueIndex('idx_day_closes_public_id').on(table.public_id),
      index('idx_day_closes_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_day_closes_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_day_closes_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_day_closes_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_day_closes_branch_id').on(table.branch_id),
      index('idx_day_closes_organization_close_date')
        .on(table.organization_id, table.close_date, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      uniqueIndex('idx_day_closes_branch_date_unique')
        .on(table.organization_id, table.branch_id, table.close_date)
        .where(sql`${table.deleted_at} IS NULL`),
      check(
        'chk_day_closes_status',
        sql`${table.status} IN (${joinValues(DAY_CLOSE_STATUS_VALUES)})`,
      ),
      check('chk_day_closes_opening_cash', sql`${table.opening_cash} >= 0`),
      check(
        'chk_day_closes_opening_source',
        sql`${table.opening_source} IN (${joinValues(DAY_CLOSE_OPENING_SOURCE_VALUES)})`,
      ),
      check('chk_day_closes_counted_cash', sql`${table.counted_cash} >= 0`),
      check('chk_day_closes_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_day_closes_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_day_closes_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_day_closes_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('day_closes_tenant_isolation', {
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
