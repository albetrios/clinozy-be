import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  index,
  integer,
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
import {
  STOCK_ITEM_CATEGORY_VALUES,
  STOCK_ITEM_UNIT_VALUES,
  STOCK_ITEM_MEASURE_UNIT_VALUES,
} from '@/domains/app/sub-domains/stock-items/stock-items.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.stock_items` — A consumable kept in stock — its levels in milli-units (×1000) (launch ROUTE #54, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `stock_items_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const stock_items = appSchema
  .table(
    'stock_items',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // The "#167" of the stock list
      stock_item_number: integer('stock_item_number').notNull().default(0),
      name: varchar('name', { length: 120 }).notNull(),
      category: varchar('category', { length: 13 }).notNull().default('creams_serums'),
      unit: varchar('unit', { length: 7 }).notNull().default('piece'),
      // "1 tube = 30 g" ×1000
      size_per_unit_milli: integer('size_per_unit_milli'),
      measure_unit: varchar('measure_unit', { length: 5 }),
      // Stock ×1000 — moved only by stock movements
      quantity_milli: integer('quantity_milli').notNull().default(0),
      min_quantity: integer('min_quantity').notNull().default(1),
      max_quantity: integer('max_quantity').notNull().default(10),
      usage_per_week_milli: integer('usage_per_week_milli').notNull().default(0),
      stock_vendor_id: bigint('stock_vendor_id', { mode: 'number' }).references(
        (): AnyPgColumn => stock_vendors.id,
        { onDelete: 'set null' },
      ),
      last_rate: numeric('last_rate', { precision: 12, scale: 2 }),
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
      uniqueIndex('idx_stock_items_public_id').on(table.public_id),
      index('idx_stock_items_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_stock_items_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_stock_items_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_stock_items_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_stock_items_organization_name')
        .on(table.organization_id, table.name, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_stock_items_stock_vendor_id')
        .on(table.stock_vendor_id)
        .where(sql`${table.stock_vendor_id} IS NOT NULL`),
      uniqueIndex('idx_stock_items_organization_stock_item_number').on(
        table.organization_id,
        table.stock_item_number,
      ),
      check('chk_stock_items_stock_item_number', sql`${table.stock_item_number} > 0`),
      check(
        'chk_stock_items_category',
        sql`${table.category} IN (${joinValues(STOCK_ITEM_CATEGORY_VALUES)})`,
      ),
      check('chk_stock_items_unit', sql`${table.unit} IN (${joinValues(STOCK_ITEM_UNIT_VALUES)})`),
      check(
        'chk_stock_items_measure_unit',
        sql`${table.measure_unit} IN (${joinValues(STOCK_ITEM_MEASURE_UNIT_VALUES)})`,
      ),
      check('chk_stock_items_quantity_milli', sql`${table.quantity_milli} >= 0`),
      check('chk_stock_items_min_quantity', sql`${table.min_quantity} BETWEEN 0 AND 99999`),
      check('chk_stock_items_max_quantity', sql`${table.max_quantity} BETWEEN 0 AND 99999`),
      check('chk_stock_items_usage_per_week_milli', sql`${table.usage_per_week_milli} >= 0`),
      check('chk_stock_items_last_rate', sql`${table.last_rate} >= 0`),
      check('chk_stock_items_quantity_levels', sql`${table.min_quantity} <= ${table.max_quantity}`),
      check(
        'chk_stock_items_measure_unit_with_size',
        sql`${table.size_per_unit_milli} IS NULL OR ${table.measure_unit} IS NOT NULL`,
      ),
      check(
        'chk_stock_items_size_positive',
        sql`${table.size_per_unit_milli} IS NULL OR ${table.size_per_unit_milli} > 0`,
      ),
      check('chk_stock_items_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_stock_items_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_stock_items_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_stock_items_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('stock_items_tenant_isolation', {
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
