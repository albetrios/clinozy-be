import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  date,
  foreignKey,
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
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import {
  DAY_CLOSE_EVENT_KIND_VALUES,
  DAY_CLOSE_KIND_VALUES,
  DAY_CLOSE_OPENING_SOURCE_VALUES,
  DAY_CLOSE_STATUS,
  DAY_CLOSE_STATUS_VALUES,
} from '@/domains/app/sub-domains/billing/day-closes/day-closes.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` CHECK. */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/** `'closed'` / `'open'` as SQL literals. */
const CLOSED = sql.raw(`'${DAY_CLOSE_STATUS.CLOSED}'`);
const OPEN = sql.raw(`'${DAY_CLOSE_STATUS.OPEN}'`);

/**
 * Drizzle table for `app.day_closes` — one branch's day: the opening cash, the counted cash, and
 * whether it is closed (launch ROUTE #136, routes-final 8.E, B25).
 *
 * @remarks
 * - **Notes:** one row per branch and day (`idx_day_closes_organization_branch_date`); no
 *   soft-delete columns — a day is opened, closed, reopened, never deleted (B25), so it is out of
 *   the purge list. Closed exactly when the close's four fields are set
 *   (`chk_day_closes_closed`); `difference` is generated, and a non-zero one needs a reason. A
 *   closed day locks its payments (B6, the payments service). The opener and closer K8 composite
 *   keys `RESTRICT` (K2). RLS on the organization GUC, with the retention-cleanup read arm for
 *   the auto-close sweep (B26); the branch is an application filter.
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
        .references(() => branches.id, { onDelete: 'restrict' }),
      close_date: date('close_date', { mode: 'string' }).notNull(),
      status: varchar('status', { length: 6 }).notNull().default('open'),
      opening_cash: numeric('opening_cash', { precision: 12, scale: 2 }).notNull(),
      opening_source: varchar('opening_source', { length: 9 }).notNull().default('carried'),
      opening_accepted_at: timestamp('opening_accepted_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
      opening_accepted_by_membership_id: bigint('opening_accepted_by_membership_id', {
        mode: 'number',
      }),
      expected_cash: numeric('expected_cash', { precision: 12, scale: 2 }),
      counted_cash: numeric('counted_cash', { precision: 12, scale: 2 }),
      difference: numeric('difference', { precision: 12, scale: 2 }).generatedAlwaysAs(
        (): SQL => sql`counted_cash - expected_cash`,
      ),
      difference_reason: varchar('difference_reason', { length: 280 }),
      close_kind: varchar('close_kind', { length: 6 }),
      closed_at: timestamp('closed_at', { withTimezone: true }),
      closed_by_membership_id: bigint('closed_by_membership_id', { mode: 'number' }),
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
      uniqueIndex('idx_day_closes_public_id').on(table.public_id),
      uniqueIndex('idx_day_closes_organization_branch_date').on(
        table.organization_id,
        table.branch_id,
        table.close_date,
      ),
      index('idx_day_closes_organization_close_date').on(
        table.organization_id,
        table.close_date.desc(),
        table.id,
      ),
      index('idx_day_closes_branch_close_date').on(table.branch_id, table.close_date),
      // The auto-close worker (B26)
      index('idx_day_closes_organization_open')
        .on(table.organization_id, table.close_date)
        .where(sql`${table.status} = ${OPEN}`),
      index('idx_day_closes_opening_accepted_by')
        .on(table.organization_id, table.opening_accepted_by_membership_id)
        .where(sql`${table.opening_accepted_by_membership_id} IS NOT NULL`),
      index('idx_day_closes_closed_by')
        .on(table.organization_id, table.closed_by_membership_id)
        .where(sql`${table.closed_by_membership_id} IS NOT NULL`),
      index('idx_day_closes_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_day_closes_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      // K8: members of this organization, kept when they leave (K2)
      foreignKey({
        name: 'day_closes_opening_accepted_by_membership_fk',
        columns: [table.organization_id, table.opening_accepted_by_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      foreignKey({
        name: 'day_closes_closed_by_membership_fk',
        columns: [table.organization_id, table.closed_by_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      check(
        'chk_day_closes_status',
        sql`${table.status} IN (${literalList(DAY_CLOSE_STATUS_VALUES)})`,
      ),
      check(
        'chk_day_closes_opening_source',
        sql`${table.opening_source} IN (${literalList(DAY_CLOSE_OPENING_SOURCE_VALUES)})`,
      ),
      check('chk_day_closes_opening_cash', sql`${table.opening_cash} >= 0`),
      check('chk_day_closes_counted_cash', sql`${table.counted_cash} >= 0`),
      check(
        'chk_day_closes_close_kind',
        sql`${table.close_kind} IN (${literalList(DAY_CLOSE_KIND_VALUES)})`,
      ),
      // Closed exactly when the close's fields are set (B25)
      check(
        'chk_day_closes_closed',
        sql`(${table.status} = ${CLOSED}) = (${table.closed_at} IS NOT NULL AND ${table.expected_cash} IS NOT NULL AND ${table.counted_cash} IS NOT NULL AND ${table.close_kind} IS NOT NULL)`,
      ),
      check(
        'chk_day_closes_difference_reason',
        sql`${table.counted_cash} IS NULL OR ${table.counted_cash} = ${table.expected_cash} OR ${table.difference_reason} IS NOT NULL`,
      ),
      check('chk_day_closes_updated', sql`${table.updated_at} >= ${table.created_at}`),
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

/**
 * Drizzle table for `app.day_close_events` — what happened to a day: opened, recounted, closed,
 * auto-closed, reopened (launch ROUTE #136, routes-final 8.E, B27).
 *
 * @remarks
 * - **Notes:** append-only — no `updated_*` or soft-delete columns; goes with its day
 *   (`CASCADE`); who did it a K8 composite key `RESTRICT` (K2), none for the auto-close worker.
 *   Written by each step in its transaction and returned inside the day close. RLS on the
 *   organization GUC.
 */
export const day_close_events = appSchema
  .table(
    'day_close_events',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      day_close_id: bigint('day_close_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => day_closes.id, { onDelete: 'cascade' }),
      kind: varchar('kind', { length: 11 }).notNull(),
      text: varchar('text', { length: 280 }),
      membership_id: bigint('membership_id', { mode: 'number' }),
      occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      uniqueIndex('idx_day_close_events_public_id').on(table.public_id),
      index('idx_day_close_events_day_close_occurred').on(table.day_close_id, table.occurred_at),
      index('idx_day_close_events_membership_id')
        .on(table.organization_id, table.membership_id)
        .where(sql`${table.membership_id} IS NOT NULL`),
      index('idx_day_close_events_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      // K8: a member of this organization, kept when they leave (K2)
      foreignKey({
        name: 'day_close_events_membership_fk',
        columns: [table.organization_id, table.membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      check(
        'chk_day_close_events_kind',
        sql`${table.kind} IN (${literalList(DAY_CLOSE_EVENT_KIND_VALUES)})`,
      ),
      pgPolicy('day_close_events_tenant_isolation', {
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
