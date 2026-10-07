import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { stock_vendors } from '@/domains/app/sub-domains/stock-vendors/stock-vendors.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.stock_purchases` — A purchase of consumables from a vendor (launch ROUTE #55, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `stock_purchases_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const stock_purchases = appSchema
  .table(
    'stock_purchases',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // The "#16" of the purchase list
      stock_purchase_number: integer('stock_purchase_number').notNull().default(0),
      stock_vendor_id: bigint('stock_vendor_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => stock_vendors.id, { onDelete: 'no action' }),
      bill_number: varchar('bill_number', { length: 30 }),
      purchase_date: date('purchase_date', { mode: 'string' }).notNull(),
      lines: jsonb('lines').notNull().default([]),
      bill_amount: numeric('bill_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
      paid_amount: numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
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
      uniqueIndex('idx_stock_purchases_public_id').on(table.public_id),
      index('idx_stock_purchases_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_stock_purchases_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_stock_purchases_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_stock_purchases_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_stock_purchases_stock_vendor_id').on(table.stock_vendor_id),
      index('idx_stock_purchases_organization_purchase_date')
        .on(table.organization_id, table.purchase_date, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      uniqueIndex('idx_stock_purchases_organization_stock_purchase_number').on(
        table.organization_id,
        table.stock_purchase_number,
      ),
      check('chk_stock_purchases_stock_purchase_number', sql`${table.stock_purchase_number} > 0`),
      check('chk_stock_purchases_bill_amount', sql`${table.bill_amount} >= 0`),
      check('chk_stock_purchases_paid_amount', sql`${table.paid_amount} >= 0`),
      check(
        'chk_stock_purchases_paid_within_bill',
        sql`${table.paid_amount} <= ${table.bill_amount}`,
      ),
      check('chk_stock_purchases_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_stock_purchases_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_stock_purchases_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_stock_purchases_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('stock_purchases_tenant_isolation', {
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
