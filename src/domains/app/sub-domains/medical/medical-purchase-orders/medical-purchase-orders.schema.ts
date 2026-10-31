import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgPolicy,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { suppliers } from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';
import {
  medicine_batches,
  medicines,
} from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import {
  MEDICINE_GST_PERCENT_VALUES,
  MEDICINE_QUANTITY_MAX,
} from '@/domains/app/sub-domains/medical/medicines/medicines.constants.js';
import {
  MEDICAL_PURCHASE_ORDER_CANCEL_REASON_VALUES,
  MEDICAL_PURCHASE_ORDER_STAGE,
  MEDICAL_PURCHASE_ORDER_STAGE_VALUES,
} from './medical-purchase-orders.constants.js';

/** The organization GUC's row, for a policy. */
const ACTIVE_ORGANIZATION = sql`(
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`;

/** What a received order still owes (MD15) — nothing while it is only ordered. */
const DUE = sql.raw(
  `CASE WHEN stage = '${MEDICAL_PURCHASE_ORDER_STAGE.RECEIVED}' THEN total - paid_amount - credited_amount ELSE 0 END`,
);

/**
 * Drizzle table for `app.medical_purchase_orders` — an order to a supplier, ordered then received
 * (launch ROUTE #153, routes-final 11.E).
 *
 * @remarks
 * - **Notes:** `stage` is `ordered` or `received` (with `received_at`); "Paid" is the generated
 *   `payment_status` on the generated `due_amount` = total − paid − credited (MD15); `total` =
 *   `taxable_total` + `gst_total`, its lines' (PG7). `paid_amount` moves with its supplier-bill
 *   payments (MD7), `credited_amount` with the supplier's credits
 *   (MD11). The cancel is the soft delete, with its own reasons, only while ordered. The supplier
 *   stays (`RESTRICT`). RLS on the organization GUC with the retention-cleanup arm for the purge.
 */
export const medical_purchase_orders = appSchema
  .table(
    'medical_purchase_orders',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      purchase_order_number: integer('purchase_order_number').notNull().default(0),
      supplier_id: bigint('supplier_id', { mode: 'number' })
        .notNull()
        .references(() => suppliers.id, { onDelete: 'restrict' }),
      supplier_bill_number: varchar('supplier_bill_number', { length: 30 }),
      // What the desk noted ("30 DAYS DUE", "without gst bill") — the one field a received order changes
      note: varchar('note', { length: 500 }),
      order_date: date('order_date', { mode: 'string' }).notNull(),
      stage: varchar('stage', { length: 8 })
        .notNull()
        .default(MEDICAL_PURCHASE_ORDER_STAGE.ORDERED),
      received_at: timestamp('received_at', { withTimezone: true }),
      total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0.00'),
      taxable_total: numeric('taxable_total', { precision: 12, scale: 2 })
        .notNull()
        .default('0.00'),
      gst_total: numeric('gst_total', { precision: 12, scale: 2 }).notNull().default('0.00'),
      paid_amount: numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
      credited_amount: numeric('credited_amount', { precision: 12, scale: 2 })
        .notNull()
        .default('0.00'),
      due_amount: numeric('due_amount', { precision: 12, scale: 2 }).generatedAlwaysAs(
        (): SQL => DUE,
      ),
      payment_status: varchar('payment_status', { length: 7 }).generatedAlwaysAs(
        (): SQL =>
          sql.raw(
            `CASE WHEN total - paid_amount - credited_amount <= 0 THEN 'paid' WHEN paid_amount + credited_amount > 0 THEN 'partial' ELSE 'unpaid' END`,
          ),
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
      delete_reason: varchar('delete_reason', { length: 21 }),
      delete_note: varchar('delete_note', { length: 280 }),
    },
    (table) => [
      uniqueIndex('idx_medical_purchase_orders_public_id').on(table.public_id),
      uniqueIndex('idx_medical_purchase_orders_organization_number').on(
        table.organization_id,
        table.purchase_order_number,
      ),
      index('idx_medical_purchase_orders_organization_order_date')
        .on(table.organization_id, table.order_date, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_medical_purchase_orders_organization_created')
        .on(table.organization_id, table.created_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_medical_purchase_orders_supplier_id').on(table.supplier_id),
      // The month's received orders — the purchase GST summary (PG15)
      index('idx_medical_purchase_orders_organization_received')
        .on(table.organization_id, table.received_at)
        .where(sql`${table.deleted_at} IS NULL AND ${table.received_at} IS NOT NULL`),
      // What each supplier is owed, oldest first (MD10, MD11)
      index('idx_medical_purchase_orders_supplier_due')
        .on(table.supplier_id, table.received_at, table.id)
        .where(sql`${table.deleted_at} IS NULL AND ${table.due_amount} > 0`),
      index('idx_medical_purchase_orders_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_medical_purchase_orders_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_medical_purchase_orders_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check(
        'chk_medical_purchase_orders_purchase_order_number',
        sql`${table.purchase_order_number} > 0`,
      ),
      check(
        'chk_medical_purchase_orders_stage',
        sql`${table.stage} IN (${sqlLiteralList(MEDICAL_PURCHASE_ORDER_STAGE_VALUES)})`,
      ),
      check(
        'chk_medical_purchase_orders_received',
        sql`(${table.stage} = '${sql.raw(MEDICAL_PURCHASE_ORDER_STAGE.RECEIVED)}') = (${table.received_at} IS NOT NULL)`,
      ),
      check(
        'chk_medical_purchase_orders_money',
        sql`${table.total} >= 0 AND ${table.paid_amount} >= 0 AND ${table.credited_amount} >= 0 AND ${table.paid_amount} + ${table.credited_amount} <= ${table.total}`,
      ),
      check('chk_medical_purchase_orders_note', sql`char_length(${table.note}) > 0`),
      check(
        'chk_medical_purchase_orders_totals',
        sql`${table.taxable_total} >= 0 AND ${table.gst_total} >= 0 AND ${table.total} = ${table.taxable_total} + ${table.gst_total}`,
      ),
      check('chk_medical_purchase_orders_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_medical_purchase_orders_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(MEDICAL_PURCHASE_ORDER_CANCEL_REASON_VALUES)})`,
      ),
      check(
        'chk_medical_purchase_orders_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_medical_purchase_orders_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('medical_purchase_orders_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}
          OR ${maintenanceBypassArm('app.global_retention_cleanup')}`,
        withCheck: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
      }),
    ],
  )
  .enableRLS();

/**
 * Drizzle table `app.medical_purchase_order_items` — one line of an order (launch ROUTE #153,
 * MD15, MD16); no routes of its own (K1) — written with the order, ticked by receive.
 *
 * @remarks
 * - **Notes:** `amount` = `taxable_amount` + `gst_amount` (the invoice calculation, PG4) —
 *   quantity × rate when `is_gst_inclusive`, quantity × rate plus GST otherwise; `is_received` is null until the order is received;
 *   a received line names the batch it went into. The medicine and batch stay (`RESTRICT`); the
 *   line goes with its order. RLS on the organization GUC.
 */
export const medical_purchase_order_items = appSchema
  .table(
    'medical_purchase_order_items',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      medical_purchase_order_id: bigint('medical_purchase_order_id', { mode: 'number' })
        .notNull()
        .references(() => medical_purchase_orders.id, { onDelete: 'cascade' }),
      line_number: smallint('line_number').notNull(),
      medicine_id: bigint('medicine_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => medicines.id, { onDelete: 'restrict' }),
      quantity: integer('quantity').notNull(),
      free_quantity: integer('free_quantity').notNull().default(0),
      rate: numeric('rate', { precision: 12, scale: 2 }).notNull(),
      // The MRP printed on the line's packs — the batch it fills takes it
      mrp: numeric('mrp', { precision: 12, scale: 2 }),
      amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
      gst_percent: smallint('gst_percent').notNull(),
      is_gst_inclusive: boolean('is_gst_inclusive').notNull().default(true),
      taxable_amount: numeric('taxable_amount', { precision: 12, scale: 2 }).notNull(),
      gst_amount: numeric('gst_amount', { precision: 12, scale: 2 }).notNull(),
      is_received: boolean('is_received'),
      batch_number: varchar('batch_number', { length: 20 }),
      expiry_month: date('expiry_month', { mode: 'string' }),
      medicine_batch_id: bigint('medicine_batch_id', { mode: 'number' }).references(
        (): AnyPgColumn => medicine_batches.id,
        { onDelete: 'restrict' },
      ),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      uniqueIndex('idx_medical_purchase_order_items_public_id').on(table.public_id),
      uniqueIndex('idx_medical_purchase_order_items_order_line').on(
        table.medical_purchase_order_id,
        table.line_number,
      ),
      index('idx_medical_purchase_order_items_organization_id').on(table.organization_id),
      index('idx_medical_purchase_order_items_medicine_id').on(table.medicine_id),
      index('idx_medical_purchase_order_items_medicine_batch_id')
        .on(table.medicine_batch_id)
        .where(sql`${table.medicine_batch_id} IS NOT NULL`),
      check('chk_medical_purchase_order_items_line_number', sql`${table.line_number} > 0`),
      check(
        'chk_medical_purchase_order_items_quantity',
        sql`${table.quantity} > 0 AND ${table.quantity} <= ${sql.raw(String(MEDICINE_QUANTITY_MAX))}`,
      ),
      check(
        'chk_medical_purchase_order_items_free_quantity',
        sql`${table.free_quantity} >= 0 AND ${table.free_quantity} <= ${sql.raw(String(MEDICINE_QUANTITY_MAX))}`,
      ),
      check('chk_medical_purchase_order_items_rate', sql`${table.rate} > 0`),
      check('chk_medical_purchase_order_items_mrp', sql`${table.mrp} > 0`),
      check(
        'chk_medical_purchase_order_items_gst_percent',
        sql`${table.gst_percent} IN (${sqlLiteralList(MEDICINE_GST_PERCENT_VALUES)})`,
      ),
      // PG4: quantity × rate is the amount when the rate includes GST, the taxable value otherwise
      check(
        'chk_medical_purchase_order_items_amount',
        sql`${table.taxable_amount} >= 0 AND ${table.gst_amount} >= 0 AND ${table.amount} = ${table.taxable_amount} + ${table.gst_amount} AND ${table.quantity} * ${table.rate} = CASE WHEN ${table.is_gst_inclusive} THEN ${table.amount} ELSE ${table.taxable_amount} END`,
      ),
      check(
        'chk_medical_purchase_order_items_expiry_month',
        sql`extract(day from ${table.expiry_month}) = 1`,
      ),
      check(
        'chk_medical_purchase_order_items_batch',
        sql`${table.is_received} IS DISTINCT FROM true OR ${table.medicine_batch_id} IS NOT NULL`,
      ),
      check(
        'chk_medical_purchase_order_items_updated',
        sql`${table.updated_at} >= ${table.created_at}`,
      ),
      pgPolicy('medical_purchase_order_items_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
        withCheck: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
      }),
    ],
  )
  .enableRLS();
