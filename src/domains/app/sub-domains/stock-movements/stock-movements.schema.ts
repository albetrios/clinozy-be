import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  index,
  integer,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { stock_counts } from '@/domains/app/sub-domains/stock-counts/stock-counts.schema.js';
import { stock_items } from '@/domains/app/sub-domains/stock-items/stock-items.schema.js';
import { stock_purchases } from '@/domains/app/sub-domains/stock-purchases/stock-purchases.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  STOCK_MOVEMENT_TYPE_VALUES,
  STOCK_MOVEMENT_REVERT_REASON_VALUES,
} from '@/domains/app/sub-domains/stock-movements/stock-movements.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.stock_movements` — One change to an item's stock — used, received, adjusted, damaged, returned or reverted (a ledger) (launch ROUTE #56, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `stock_movements_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const stock_movements = appSchema
  .table(
    'stock_movements',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      stock_item_id: bigint('stock_item_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => stock_items.id, { onDelete: 'no action' }),
      type: varchar('type', { length: 8 }).notNull().default('used'),
      // Signed change ×1000, never 0
      delta_milli: integer('delta_milli').notNull(),
      used_for: varchar('used_for', { length: 80 }),
      patient_id: bigint('patient_id', { mode: 'number' }).references(
        (): AnyPgColumn => patients.id,
        { onDelete: 'set null' },
      ),
      stock_purchase_id: bigint('stock_purchase_id', { mode: 'number' }).references(
        (): AnyPgColumn => stock_purchases.id,
        { onDelete: 'set null' },
      ),
      stock_count_id: bigint('stock_count_id', { mode: 'number' }).references(
        (): AnyPgColumn => stock_counts.id,
        { onDelete: 'set null' },
      ),
      reverts_stock_movement_id: bigint('reverts_stock_movement_id', { mode: 'number' }).references(
        (): AnyPgColumn => stock_movements.id,
        { onDelete: 'set null' },
      ),
      reverted_by_stock_movement_id: bigint('reverted_by_stock_movement_id', {
        mode: 'number',
      }).references((): AnyPgColumn => stock_movements.id, { onDelete: 'set null' }),
      revert_reason: varchar('revert_reason', { length: 14 }),
      note: varchar('note', { length: 280 }),
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
      uniqueIndex('idx_stock_movements_public_id').on(table.public_id),
      index('idx_stock_movements_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_stock_movements_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_stock_movements_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_stock_movements_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_stock_movements_stock_item_id').on(table.stock_item_id),
      index('idx_stock_movements_patient_id')
        .on(table.patient_id)
        .where(sql`${table.patient_id} IS NOT NULL`),
      index('idx_stock_movements_stock_purchase_id')
        .on(table.stock_purchase_id)
        .where(sql`${table.stock_purchase_id} IS NOT NULL`),
      index('idx_stock_movements_stock_count_id')
        .on(table.stock_count_id)
        .where(sql`${table.stock_count_id} IS NOT NULL`),
      index('idx_stock_movements_reverts_stock_movement_id')
        .on(table.reverts_stock_movement_id)
        .where(sql`${table.reverts_stock_movement_id} IS NOT NULL`),
      index('idx_stock_movements_reverted_by_stock_movement_id')
        .on(table.reverted_by_stock_movement_id)
        .where(sql`${table.reverted_by_stock_movement_id} IS NOT NULL`),
      check(
        'chk_stock_movements_type',
        sql`${table.type} IN (${joinValues(STOCK_MOVEMENT_TYPE_VALUES)})`,
      ),
      check(
        'chk_stock_movements_revert_reason',
        sql`${table.revert_reason} IN (${joinValues(STOCK_MOVEMENT_REVERT_REASON_VALUES)})`,
      ),
      check('chk_stock_movements_delta_nonzero', sql`${table.delta_milli} <> 0`),
      check('chk_stock_movements_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_stock_movements_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_stock_movements_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_stock_movements_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('stock_movements_tenant_isolation', {
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
