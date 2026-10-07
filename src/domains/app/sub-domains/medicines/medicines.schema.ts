import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
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
import { manufacturers } from '@/domains/app/sub-domains/manufacturers/manufacturers.schema.js';
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
 * Drizzle table for `app.medicines` — A medicine the store stocks — its batches, supplier rates and stock levels (launch ROUTE #48, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `medicines_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
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
      // The "#458" of the medicine list
      medicine_number: integer('medicine_number').notNull().default(0),
      name: varchar('name', { length: 120 }).notNull(),
      composition: varchar('composition', { length: 160 }),
      manufacturer_id: bigint('manufacturer_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => manufacturers.id, { onDelete: 'no action' }),
      mrp: numeric('mrp', { precision: 12, scale: 2 }).notNull(),
      gst_percent: integer('gst_percent').notNull().default(12),
      min_stock: integer('min_stock').notNull().default(2),
      max_stock: integer('max_stock').notNull().default(10),
      batches: jsonb('batches').notNull().default([]),
      supplier_rates: jsonb('supplier_rates').notNull().default([]),
      // Quick-created (a doctor typing a new name) — needs MRP and composition
      is_quick: boolean('is_quick').notNull().default(false),
      is_prescription_only: boolean('is_prescription_only').notNull().default(false),
      near_expiry_discount_percent: numeric('near_expiry_discount_percent', {
        precision: 5,
        scale: 2,
      })
        .notNull()
        .default('0.00'),
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
      index('idx_medicines_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_medicines_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_medicines_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_medicines_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_medicines_organization_name')
        .on(table.organization_id, table.name, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_medicines_manufacturer_id').on(table.manufacturer_id),
      uniqueIndex('idx_medicines_organization_medicine_number').on(
        table.organization_id,
        table.medicine_number,
      ),
      check('chk_medicines_medicine_number', sql`${table.medicine_number} > 0`),
      check('chk_medicines_mrp', sql`${table.mrp} >= 0`),
      check('chk_medicines_gst_percent', sql`${table.gst_percent} IN (0, 5, 12, 18, 28)`),
      check('chk_medicines_min_stock', sql`${table.min_stock} BETWEEN 0 AND 9999`),
      check('chk_medicines_max_stock', sql`${table.max_stock} BETWEEN 0 AND 9999`),
      check(
        'chk_medicines_near_expiry_discount_percent',
        sql`${table.near_expiry_discount_percent} BETWEEN 0 AND 100`,
      ),
      check('chk_medicines_mrp_positive', sql`${table.mrp} > 0`),
      check('chk_medicines_stock_levels', sql`${table.min_stock} <= ${table.max_stock}`),
      check('chk_medicines_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_medicines_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_medicines_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_medicines_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('medicines_tenant_isolation', {
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
