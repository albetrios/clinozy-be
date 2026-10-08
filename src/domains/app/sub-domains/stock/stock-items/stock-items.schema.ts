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
import { stock_vendors } from '@/domains/app/sub-domains/stock/stock-vendors/stock-vendors.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  STOCK_ITEM_CATEGORY_VALUES,
  STOCK_ITEM_DEFAULT_MAX_QUANTITY,
  STOCK_ITEM_DEFAULT_MIN_QUANTITY,
  STOCK_ITEM_MEASURE_UNIT_VALUES,
  STOCK_ITEM_UNIT_VALUES,
} from '@/domains/app/sub-domains/stock/stock-items/stock-items.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` CHECK. */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/**
 * Drizzle table for `app.stock_items` — one consumable or piece of equipment and how much is left
 * (launch ROUTE #137, routes-final 9.A).
 *
 * @remarks
 * - **Notes:** quantities are exact decimals (S4); `quantity` is the balance, moved only with a
 *   movement in the same transaction by one guarded update (S5) — never below 0. The size and its
 *   measure come both or neither, the maximum is never under the minimum, the name is unique among
 *   live items in any case; `last_rate` follows the latest purchase line (S10). "#167" from the
 *   record counter. RLS on the organization GUC with the retention-cleanup arm for the purge; no
 *   branch (S3).
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
      // The "#167" of the Items tab
      stock_item_number: integer('stock_item_number').notNull().default(0),
      name: varchar('name', { length: 120 }).notNull(),
      category: varchar('category', { length: 13 }).notNull().default('consumables'),
      unit: varchar('unit', { length: 7 }).notNull().default('piece'),
      // "1 tube = 30 g"
      size_per_unit: numeric('size_per_unit', { precision: 12, scale: 3 }),
      measure_unit: varchar('measure_unit', { length: 5 }),
      // The balance — moved only with a movement (S5)
      quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull().default('0'),
      min_quantity: numeric('min_quantity', { precision: 12, scale: 3 })
        .notNull()
        .default(String(STOCK_ITEM_DEFAULT_MIN_QUANTITY)),
      max_quantity: numeric('max_quantity', { precision: 12, scale: 3 })
        .notNull()
        .default(String(STOCK_ITEM_DEFAULT_MAX_QUANTITY)),
      usage_per_week: numeric('usage_per_week', { precision: 12, scale: 3 }).notNull().default('0'),
      stock_vendor_id: bigint('stock_vendor_id', { mode: 'number' }).references(
        (): AnyPgColumn => stock_vendors.id,
        { onDelete: 'set null' },
      ),
      // The latest purchase line's rate (S10)
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
      uniqueIndex('idx_stock_items_organization_number').on(
        table.organization_id,
        table.stock_item_number,
      ),
      uniqueIndex('idx_stock_items_organization_name_unique')
        .on(table.organization_id, sql`lower(${table.name})`)
        .where(sql`${table.deleted_at} IS NULL`),
      // The Items tab, by name
      index('idx_stock_items_organization_name')
        .on(table.organization_id, table.name, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_stock_items_organization_category')
        .on(table.organization_id, table.category, table.name)
        .where(sql`${table.deleted_at} IS NULL`),
      // The low list — "⚡ Reorder low items"
      index('idx_stock_items_organization_low')
        .on(table.organization_id)
        .where(sql`${table.deleted_at} IS NULL AND ${table.quantity} <= ${table.min_quantity}`),
      index('idx_stock_items_organization_created')
        .on(table.organization_id, table.created_at.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_stock_items_stock_vendor_id')
        .on(table.stock_vendor_id)
        .where(sql`${table.stock_vendor_id} IS NOT NULL`),
      index('idx_stock_items_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_stock_items_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_stock_items_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_stock_items_number', sql`${table.stock_item_number} > 0`),
      check('chk_stock_items_name', sql`char_length(${table.name}) > 0`),
      check(
        'chk_stock_items_category',
        sql`${table.category} IN (${literalList(STOCK_ITEM_CATEGORY_VALUES)})`,
      ),
      check('chk_stock_items_unit', sql`${table.unit} IN (${literalList(STOCK_ITEM_UNIT_VALUES)})`),
      check(
        'chk_stock_items_measure_unit',
        sql`${table.measure_unit} IN (${literalList(STOCK_ITEM_MEASURE_UNIT_VALUES)})`,
      ),
      check('chk_stock_items_size_per_unit', sql`${table.size_per_unit} > 0`),
      // The size and its measure come both or neither
      check(
        'chk_stock_items_size_with_measure',
        sql`(${table.size_per_unit} IS NULL) = (${table.measure_unit} IS NULL)`,
      ),
      check('chk_stock_items_quantity', sql`${table.quantity} >= 0`),
      check('chk_stock_items_min_quantity', sql`${table.min_quantity} >= 0`),
      check('chk_stock_items_max_quantity', sql`${table.max_quantity} >= ${table.min_quantity}`),
      check('chk_stock_items_usage_per_week', sql`${table.usage_per_week} >= 0`),
      check('chk_stock_items_last_rate', sql`${table.last_rate} >= 0`),
      check('chk_stock_items_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_stock_items_delete_reason',
        sql`${table.delete_reason} IN (${literalList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_stock_items_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_stock_items_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
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
