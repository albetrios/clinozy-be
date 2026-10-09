import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  date,
  index,
  integer,
  numeric,
  pgPolicy,
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { stock_items } from '@/domains/app/sub-domains/stock/stock-items/stock-items.schema.js';
import { stock_vendors } from '@/domains/app/sub-domains/stock/stock-vendors/stock-vendors.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import { STOCK_PURCHASE_ITEMS_MAX } from '@/domains/app/sub-domains/stock/stock-purchases/stock-purchases.constants.js';

/**
 * Drizzle table for `app.stock_purchases` — one vendor bill: what arrived and what is owed (launch
 * ROUTE #137, routes-final 9.D).
 *
 * @remarks
 * - **Notes:** its lines are `app.stock_purchase_items`, each a `received` movement (S10);
 *   `paid_amount` is kept by the supplier-bill payments that point at it (S11), never over the
 *   bill, and `due_amount` / `payment_status` are generated as on invoices. Its vendor stays
 *   (`RESTRICT`). "#16" from the record counter. RLS on the organization GUC with the
 *   retention-cleanup arm for the purge; no branch (S3).
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
      // The "#16" of the Purchases tab
      stock_purchase_number: integer('stock_purchase_number').notNull().default(0),
      stock_vendor_id: bigint('stock_vendor_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => stock_vendors.id, { onDelete: 'restrict' }),
      // The vendor's own bill number
      bill_number: varchar('bill_number', { length: 30 }),
      purchase_date: date('purchase_date', { mode: 'string' }).notNull(),
      bill_amount: numeric('bill_amount', { precision: 12, scale: 2 }).notNull(),
      // Kept by the supplier-bill payments that point at it (S11)
      paid_amount: numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
      due_amount: numeric('due_amount', { precision: 12, scale: 2 }).generatedAlwaysAs(
        (): SQL => sql`bill_amount - paid_amount`,
      ),
      payment_status: varchar('payment_status', { length: 7 }).generatedAlwaysAs(
        (): SQL =>
          sql`CASE WHEN bill_amount - paid_amount <= 0 THEN 'paid' WHEN paid_amount > 0 THEN 'partial' ELSE 'unpaid' END`,
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
      uniqueIndex('idx_stock_purchases_public_id').on(table.public_id),
      uniqueIndex('idx_stock_purchases_organization_number').on(
        table.organization_id,
        table.stock_purchase_number,
      ),
      // The Purchases tab, newest first
      index('idx_stock_purchases_organization_purchase_date')
        .on(table.organization_id, table.purchase_date.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_stock_purchases_stock_vendor_purchase_date').on(
        table.stock_vendor_id,
        table.purchase_date,
      ),
      // What is owed — the footer and the vendors' payable
      index('idx_stock_purchases_organization_due')
        .on(table.organization_id, table.purchase_date)
        .where(sql`${table.deleted_at} IS NULL AND ${table.due_amount} > 0`),
      index('idx_stock_purchases_organization_created')
        .on(table.organization_id, table.created_at.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_stock_purchases_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_stock_purchases_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_stock_purchases_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_stock_purchases_number', sql`${table.stock_purchase_number} > 0`),
      check('chk_stock_purchases_bill_amount', sql`${table.bill_amount} >= 0`),
      check(
        'chk_stock_purchases_paid_amount',
        sql`${table.paid_amount} >= 0 AND ${table.paid_amount} <= ${table.bill_amount}`,
      ),
      check('chk_stock_purchases_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_stock_purchases_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_stock_purchases_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_stock_purchases_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
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

/**
 * Drizzle table `app.stock_purchase_items` — one line of a purchase: the item, how much arrived,
 * its rate and amount (S10), no public id (part of the purchase, written with it).
 *
 * @remarks
 * - **Notes:** fixed once saved (S10); `amount` is quantity × rate, rounded by the server; lines
 *   1–50 per purchase (the key); the rows go with their purchase (`CASCADE`), an item they name
 *   stays (`RESTRICT`). RLS is the organization policy.
 */
export const stock_purchase_items = appSchema
  .table(
    'stock_purchase_items',
    {
      stock_purchase_id: bigint('stock_purchase_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => stock_purchases.id, { onDelete: 'cascade' }),
      line_number: smallint('line_number').notNull(),
      stock_item_id: bigint('stock_item_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => stock_items.id, { onDelete: 'restrict' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
      rate: numeric('rate', { precision: 12, scale: 2 }).notNull(),
      amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    },
    (table) => [
      index('idx_stock_purchase_items_organization_id').on(table.organization_id),
      primaryKey({
        name: 'stock_purchase_items_pkey',
        columns: [table.stock_purchase_id, table.line_number],
      }),
      index('idx_stock_purchase_items_stock_item_id').on(table.stock_item_id),
      check(
        'chk_stock_purchase_items_line_number',
        sql`${table.line_number} BETWEEN 1 AND ${sql.raw(String(STOCK_PURCHASE_ITEMS_MAX))}`,
      ),
      check('chk_stock_purchase_items_quantity', sql`${table.quantity} > 0`),
      check('chk_stock_purchase_items_rate', sql`${table.rate} >= 0`),
      check('chk_stock_purchase_items_amount', sql`${table.amount} >= 0`),
      pgPolicy('stock_purchase_items_tenant_isolation', {
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
