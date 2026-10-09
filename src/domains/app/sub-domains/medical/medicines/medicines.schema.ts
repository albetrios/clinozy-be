import { sql } from 'drizzle-orm';
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
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteral, sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { manufacturers } from '@/domains/app/sub-domains/medical/manufacturers/manufacturers.schema.js';
import { suppliers } from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';
import { medical_purchase_orders } from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  MEDICINE_DEFAULT_GST_PERCENT,
  MEDICINE_DEFAULT_MAX_STOCK,
  MEDICINE_DEFAULT_MIN_STOCK,
  MEDICINE_GST_PERCENT_VALUES,
  MEDICINE_NEAR_EXPIRY_DISCOUNT_MAX,
  MEDICINE_QUANTITY_MAX,
} from './medicines.constants.js';

/** The organization GUC's row, for a policy. */
const ACTIVE_ORGANIZATION = sql`(
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`;

/**
 * Drizzle table for `app.medicines` — a medicine the store sells (launch ROUTE #153,
 * routes-final 11.D).
 *
 * @remarks
 * - **Notes:** the name is unique among live medicines in any case; the MRP has GST inside and is
 *   above 0 unless the medicine is quick (added from an order line — MD12), which is also the only
 *   one without a manufacturer; `quantity` is its batches' sum, written with them (MD4); the low
 *   index serves "Low stock". Its manufacturer stays (`RESTRICT`); its batches and prices go with
 *   it. RLS on the organization GUC with the retention-cleanup arm for the purge; no branch (MD3).
 */
export const medicines = appSchema
  .table(
    'medicines',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      medicine_number: integer('medicine_number').notNull().default(0),
      name: varchar('name', { length: 120 }).notNull(),
      composition: varchar('composition', { length: 160 }),
      manufacturer_id: bigint('manufacturer_id', { mode: 'number' }).references(
        () => manufacturers.id,
        { onDelete: 'restrict' },
      ),
      is_prescription_only: boolean('is_prescription_only').notNull().default(false),
      mrp: numeric('mrp', { precision: 12, scale: 2 }).notNull().default('0.00'),
      gst_percent: smallint('gst_percent').notNull().default(MEDICINE_DEFAULT_GST_PERCENT),
      min_stock: integer('min_stock').notNull().default(MEDICINE_DEFAULT_MIN_STOCK),
      max_stock: integer('max_stock').notNull().default(MEDICINE_DEFAULT_MAX_STOCK),
      // Its batches' sum (MD4)
      quantity: integer('quantity').notNull().default(0),
      near_expiry_discount_percent: numeric('near_expiry_discount_percent', {
        precision: 5,
        scale: 2,
      }),
      // Added from an order line (MD12, MD15)
      is_quick: boolean('is_quick').notNull().default(false),
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
      uniqueIndex('idx_medicines_public_id').on(table.public_id),
      uniqueIndex('idx_medicines_organization_medicine_number').on(
        table.organization_id,
        table.medicine_number,
      ),
      uniqueIndex('idx_medicines_organization_name_unique')
        .on(table.organization_id, sql`lower(${table.name})`)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_medicines_organization_name')
        .on(table.organization_id, table.name, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_medicines_organization_created')
        .on(table.organization_id, table.created_at.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      // "Low stock" (MD12)
      index('idx_medicines_organization_low')
        .on(table.organization_id, table.name)
        .where(sql`${table.deleted_at} IS NULL AND ${table.quantity} <= ${table.min_stock}`),
      index('idx_medicines_manufacturer_id')
        .on(table.manufacturer_id)
        .where(sql`${table.manufacturer_id} IS NOT NULL`),
      index('idx_medicines_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_medicines_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_medicines_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_medicines_medicine_number', sql`${table.medicine_number} > 0`),
      check('chk_medicines_name', sql`char_length(${table.name}) > 0`),
      check(
        'chk_medicines_manufacturer',
        sql`${table.manufacturer_id} IS NOT NULL OR ${table.is_quick}`,
      ),
      check('chk_medicines_mrp', sql`${table.mrp} > 0 OR (${table.is_quick} AND ${table.mrp} = 0)`),
      check(
        'chk_medicines_gst_percent',
        sql`${table.gst_percent} IN (${sqlLiteralList(MEDICINE_GST_PERCENT_VALUES)})`,
      ),
      check(
        'chk_medicines_stock_levels',
        sql`${table.min_stock} >= 0 AND ${table.max_stock} >= ${table.min_stock} AND ${table.max_stock} <= ${sqlLiteral(MEDICINE_QUANTITY_MAX)}`,
      ),
      check('chk_medicines_quantity', sql`${table.quantity} >= 0`),
      check(
        'chk_medicines_near_expiry_discount_percent',
        sql`${table.near_expiry_discount_percent} > 0 AND ${table.near_expiry_discount_percent} <= ${sqlLiteral(MEDICINE_NEAR_EXPIRY_DISCOUNT_MAX)}`,
      ),
      check('chk_medicines_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_medicines_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_medicines_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_medicines_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('medicines_tenant_isolation', {
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
 * Drizzle table `app.medicine_batches` — one batch of a medicine and how much of it is left
 * (launch ROUTE #153, MD5, MD13); no routes of its own (K1) — written with the medicine, a sale,
 * a received order line, a return or a supplier credit.
 *
 * @remarks
 * - **Notes:** the batch number is unique per medicine in any case; `expiry_month` is the month's
 *   first day; `quantity` moves only with a guarded update that keeps it `≥ 0` (MD4). Sales draw
 *   from the earliest expiry (the stock index). A batch a sale, order line or credit names stays
 *   (`RESTRICT` there); it goes with its medicine. RLS on the organization GUC.
 */
export const medicine_batches = appSchema
  .table(
    'medicine_batches',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      medicine_id: bigint('medicine_id', { mode: 'number' })
        .notNull()
        .references(() => medicines.id, { onDelete: 'cascade' }),
      batch_number: varchar('batch_number', { length: 20 }).notNull(),
      expiry_month: date('expiry_month', { mode: 'string' }).notNull(),
      quantity: integer('quantity').notNull().default(0),
      purchase_rate: numeric('purchase_rate', { precision: 12, scale: 2 }),
      supplier_id: bigint('supplier_id', { mode: 'number' }).references(() => suppliers.id, {
        onDelete: 'set null',
      }),
      medical_purchase_order_id: bigint('medical_purchase_order_id', {
        mode: 'number',
      }).references((): AnyPgColumn => medical_purchase_orders.id, { onDelete: 'set null' }),
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
      uniqueIndex('idx_medicine_batches_public_id').on(table.public_id),
      uniqueIndex('idx_medicine_batches_medicine_batch_number_unique').on(
        table.medicine_id,
        sql`lower(${table.batch_number})`,
      ),
      // The order a sale draws in: earliest expiry first, then the oldest batch (MD5)
      index('idx_medicine_batches_medicine_stock')
        .on(table.medicine_id, table.expiry_month, table.id)
        .where(sql`${table.quantity} > 0`),
      index('idx_medicine_batches_organization_id').on(table.organization_id),
      index('idx_medicine_batches_supplier_id')
        .on(table.supplier_id)
        .where(sql`${table.supplier_id} IS NOT NULL`),
      index('idx_medicine_batches_medical_purchase_order_id')
        .on(table.medical_purchase_order_id)
        .where(sql`${table.medical_purchase_order_id} IS NOT NULL`),
      index('idx_medicine_batches_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_medicine_batches_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_medicine_batches_batch_number', sql`char_length(${table.batch_number}) > 0`),
      check('chk_medicine_batches_expiry_month', sql`extract(day from ${table.expiry_month}) = 1`),
      check(
        'chk_medicine_batches_quantity',
        sql`${table.quantity} >= 0 AND ${table.quantity} <= ${sqlLiteral(MEDICINE_QUANTITY_MAX)}`,
      ),
      check('chk_medicine_batches_purchase_rate', sql`${table.purchase_rate} >= 0`),
      check('chk_medicine_batches_updated', sql`${table.updated_at} >= ${table.created_at}`),
      pgPolicy('medicine_batches_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
        withCheck: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
      }),
    ],
  )
  .enableRLS();

/**
 * Drizzle table `app.medicine_supplier_prices` — what a supplier charges for a medicine (launch
 * ROUTE #153, MD13); no routes of its own (K1) — written with the medicine, refreshed by a
 * received order line.
 *
 * @remarks
 * - **Notes:** one row per medicine and supplier; the lowest rate is the medicine's `best_rate`.
 *   Goes with either side. RLS on the organization GUC.
 */
export const medicine_supplier_prices = appSchema
  .table(
    'medicine_supplier_prices',
    {
      medicine_id: bigint('medicine_id', { mode: 'number' })
        .notNull()
        .references(() => medicines.id, { onDelete: 'cascade' }),
      supplier_id: bigint('supplier_id', { mode: 'number' })
        .notNull()
        .references(() => suppliers.id, { onDelete: 'cascade' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      rate: numeric('rate', { precision: 12, scale: 2 }).notNull(),
      free_quantity: integer('free_quantity').notNull().default(0),
      lead_days: integer('lead_days').notNull().default(0),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      primaryKey({
        name: 'medicine_supplier_prices_pkey',
        columns: [table.medicine_id, table.supplier_id],
      }),
      index('idx_medicine_supplier_prices_supplier_id').on(table.supplier_id),
      index('idx_medicine_supplier_prices_organization_id').on(table.organization_id),
      check('chk_medicine_supplier_prices_rate', sql`${table.rate} > 0`),
      check(
        'chk_medicine_supplier_prices_free_quantity',
        sql`${table.free_quantity} >= 0 AND ${table.free_quantity} <= ${sqlLiteral(MEDICINE_QUANTITY_MAX)}`,
      ),
      check(
        'chk_medicine_supplier_prices_lead_days',
        sql`${table.lead_days} >= 0 AND ${table.lead_days} <= 365`,
      ),
      check(
        'chk_medicine_supplier_prices_updated',
        sql`${table.updated_at} >= ${table.created_at}`,
      ),
      pgPolicy('medicine_supplier_prices_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
        withCheck: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
      }),
    ],
  )
  .enableRLS();
