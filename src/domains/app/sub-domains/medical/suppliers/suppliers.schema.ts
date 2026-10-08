import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  pgPolicy,
  primaryKey,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { manufacturers } from '@/domains/app/sub-domains/medical/manufacturers/manufacturers.schema.js';
import {
  GST_NUMBER_PATTERN,
  PHONE_NUMBER_PATTERN,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` CHECK. */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/** The organization GUC's row, for a policy. */
const ACTIVE_ORGANIZATION = sql`(
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`;

/**
 * Drizzle table for `app.suppliers` — an agency the medical store buys from (launch ROUTE #153,
 * routes-final 11.B).
 *
 * @remarks
 * - **Notes:** the name is unique among live suppliers in any case; `phone` is `+91` and ten
 *   digits, `gst_number` a GSTIN (MD10); `is_quick` marks one a picker added. Never the clinic
 *   stock's vendors (S13). Its orders and credits keep it (`RESTRICT`); its prices and links go
 *   with it. RLS on the organization GUC with the retention-cleanup arm for the purge; no branch.
 */
export const suppliers = appSchema
  .table(
    'suppliers',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      name: varchar('name', { length: 120 }).notNull(),
      phone: varchar('phone', { length: 13 }),
      gst_number: varchar('gst_number', { length: 15 }),
      // Added inline from a picker (the design's "Add supplier")
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
      uniqueIndex('idx_suppliers_public_id').on(table.public_id),
      uniqueIndex('idx_suppliers_organization_name_unique')
        .on(table.organization_id, sql`lower(${table.name})`)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_suppliers_organization_name')
        .on(table.organization_id, table.name, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_suppliers_organization_created')
        .on(table.organization_id, table.created_at.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_suppliers_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_suppliers_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_suppliers_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_suppliers_name', sql`char_length(${table.name}) > 0`),
      check('chk_suppliers_phone', sql`${table.phone} ~ ${sql.raw(`'${PHONE_NUMBER_PATTERN}'`)}`),
      check(
        'chk_suppliers_gst_number',
        sql`${table.gst_number} ~ ${sql.raw(`'${GST_NUMBER_PATTERN}'`)}`,
      ),
      check('chk_suppliers_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_suppliers_delete_reason',
        sql`${table.delete_reason} IN (${literalList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_suppliers_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_suppliers_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('suppliers_tenant_isolation', {
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
 * Drizzle link table `app.supplier_manufacturers` — who distributes which brand (launch ROUTE #153,
 * MD9, MD10): written by the supplier's `manufacturer_ids` and the manufacturer's `supplier_ids`.
 * One row per pair; removing either side removes the row. RLS on the organization GUC.
 */
export const supplier_manufacturers = appSchema
  .table(
    'supplier_manufacturers',
    {
      supplier_id: bigint('supplier_id', { mode: 'number' })
        .notNull()
        .references(() => suppliers.id, { onDelete: 'cascade' }),
      manufacturer_id: bigint('manufacturer_id', { mode: 'number' })
        .notNull()
        .references(() => manufacturers.id, { onDelete: 'cascade' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      primaryKey({
        name: 'supplier_manufacturers_pkey',
        columns: [table.supplier_id, table.manufacturer_id],
      }),
      index('idx_supplier_manufacturers_manufacturer_id').on(table.manufacturer_id),
      index('idx_supplier_manufacturers_organization_id').on(table.organization_id),
      index('idx_supplier_manufacturers_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('supplier_manufacturers_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
        withCheck: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
      }),
    ],
  )
  .enableRLS();
