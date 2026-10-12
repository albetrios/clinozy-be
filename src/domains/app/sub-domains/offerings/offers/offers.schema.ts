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
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import {
  CHIP_TONE_VALUES,
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  OFFER_EXTRA_SESSIONS_MAX,
  OFFER_KIND,
  OFFER_KIND_VALUES,
  OFFER_PERCENT_MAX,
} from '@/domains/app/sub-domains/offerings/offers/offers.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.offers` — A limited-time price on offerings (launch ROUTE #12, rebuilt at
 * #128 — routes-final §3.C; domain `app`, nested in sub-domain `offerings`). The code is unique among
 * live offers and the value's range follows its kind (O11).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `offers_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const offers = appSchema
  .table(
    'offers',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      name: varchar('name', { length: 80 }).notNull(),
      code: varchar('code', { length: 16 }),
      kind: varchar('kind', { length: 7 }).notNull().default('percent'),
      // percent: whole 1–100; amount and fixed: rupees above 0; extra: whole sessions 1–99 (O11)
      value: numeric('value', { precision: 12, scale: 2 }).notNull(),
      // Empty = from now on
      starts_on: date('starts_on', { mode: 'string' }),
      // Empty = no end
      ends_on: date('ends_on', { mode: 'string' }),
      // false = paused (O10); the response derives `status` from this and the dates
      is_active: boolean('is_active').notNull().default(true),
      tone: varchar('tone', { length: 10 }).notNull().default('blush'),
      note: text('note'),
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
      uniqueIndex('idx_offers_public_id').on(table.public_id),
      index('idx_offers_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_offers_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_offers_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_offers_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_offers_organization_name')
        .on(table.organization_id, table.name, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      // The starts_on sort keeps offers without a start (O10): an empty start sorts as the earliest
      index('idx_offers_organization_starts_on')
        .on(table.organization_id, sql`coalesce(${table.starts_on}, '-infinity'::date)`, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      uniqueIndex('idx_offers_organization_code_unique')
        .on(table.organization_id, table.code)
        .where(sql`${table.deleted_at} IS NULL AND ${table.code} IS NOT NULL`),
      check('chk_offers_kind', sql`${table.kind} IN (${joinValues(OFFER_KIND_VALUES)})`),
      check(
        'chk_offers_value_for_kind',
        sql`(${table.kind} = ${OFFER_KIND.PERCENT} AND ${table.value} BETWEEN 1 AND ${sql.raw(String(OFFER_PERCENT_MAX))} AND ${table.value} = trunc(${table.value}))
          OR (${table.kind} IN (${OFFER_KIND.AMOUNT}, ${OFFER_KIND.FIXED}) AND ${table.value} > 0)
          OR (${table.kind} = ${OFFER_KIND.EXTRA} AND ${table.value} BETWEEN 1 AND ${sql.raw(String(OFFER_EXTRA_SESSIONS_MAX))} AND ${table.value} = trunc(${table.value}))`,
      ),
      check('chk_offers_tone', sql`${table.tone} IN (${joinValues(CHIP_TONE_VALUES)})`),
      check(
        'chk_offers_ends_after_starts',
        sql`${table.ends_on} IS NULL OR ${table.starts_on} IS NULL OR ${table.ends_on} >= ${table.starts_on}`,
      ),
      check('chk_offers_code', sql`${table.code} ~ '^[A-Z0-9]+$'`),
      check('chk_offers_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_offers_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_offers_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_offers_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('offers_tenant_isolation', {
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
 * Drizzle link table `app.offer_offerings` — the `offering_ids` of an offer (launch ROUTE #12).
 * One row per pair; removing either side removes the row. RLS on the organization GUC.
 */
export const offer_offerings = appSchema
  .table(
    'offer_offerings',
    {
      offer_id: bigint('offer_id', { mode: 'number' })
        .notNull()
        .references(() => offers.id, { onDelete: 'cascade' }),
      offering_id: bigint('offering_id', { mode: 'number' })
        .notNull()
        .references(() => offerings.id, { onDelete: 'cascade' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      primaryKey({ name: 'offer_offerings_pkey', columns: [table.offer_id, table.offering_id] }),
      index('idx_offer_offerings_offering_id').on(table.offering_id),
      index('idx_offer_offerings_organization_id').on(table.organization_id),
      index('idx_offer_offerings_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('offer_offerings_tenant_isolation', {
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
 * Drizzle link table `app.offer_branches` — the `branch_ids` of an offer (launch ROUTE #12).
 * One row per pair; removing either side removes the row. RLS on the organization GUC.
 */
export const offer_branches = appSchema
  .table(
    'offer_branches',
    {
      offer_id: bigint('offer_id', { mode: 'number' })
        .notNull()
        .references(() => offers.id, { onDelete: 'cascade' }),
      branch_id: bigint('branch_id', { mode: 'number' })
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
      primaryKey({ name: 'offer_branches_pkey', columns: [table.offer_id, table.branch_id] }),
      index('idx_offer_branches_branch_id').on(table.branch_id),
      index('idx_offer_branches_organization_id').on(table.organization_id),
      index('idx_offer_branches_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('offer_branches_tenant_isolation', {
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
