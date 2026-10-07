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
import { suppliers } from '@/domains/app/sub-domains/suppliers/suppliers.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  MEDICAL_PURCHASE_ORDER_STAGE_VALUES,
  MEDICAL_PURCHASE_ORDER_CANCEL_REASON_VALUES,
} from '@/domains/app/sub-domains/medical-purchase-orders/medical-purchase-orders.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.medical_purchase_orders` — An order of medicines from a supplier — received into stock, then paid (launch ROUTE #49, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `medical_purchase_orders_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
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
      // The "PO #431" running number
      purchase_order_number: integer('purchase_order_number').notNull().default(0),
      supplier_id: bigint('supplier_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => suppliers.id, { onDelete: 'no action' }),
      supplier_bill_number: varchar('supplier_bill_number', { length: 30 }),
      order_date: date('order_date', { mode: 'string' }).notNull(),
      stage: varchar('stage', { length: 9 }).notNull().default('ordered'),
      items: jsonb('items').notNull().default([]),
      paid_amount: numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
      cancel_reason: varchar('cancel_reason', { length: 10 }),
      received_at: timestamp('received_at', { withTimezone: true }),
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
      uniqueIndex('idx_medical_purchase_orders_public_id').on(table.public_id),
      index('idx_medical_purchase_orders_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_medical_purchase_orders_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_medical_purchase_orders_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_medical_purchase_orders_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_medical_purchase_orders_supplier_id').on(table.supplier_id),
      index('idx_medical_purchase_orders_organization_order_date')
        .on(table.organization_id, table.order_date, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      uniqueIndex('idx_medical_purchase_orders_organization_purchase_order_number').on(
        table.organization_id,
        table.purchase_order_number,
      ),
      check(
        'chk_medical_purchase_orders_purchase_order_number',
        sql`${table.purchase_order_number} > 0`,
      ),
      check(
        'chk_medical_purchase_orders_stage',
        sql`${table.stage} IN (${joinValues(MEDICAL_PURCHASE_ORDER_STAGE_VALUES)})`,
      ),
      check('chk_medical_purchase_orders_paid_amount', sql`${table.paid_amount} >= 0`),
      check(
        'chk_medical_purchase_orders_cancel_reason',
        sql`${table.cancel_reason} IN (${joinValues(MEDICAL_PURCHASE_ORDER_CANCEL_REASON_VALUES)})`,
      ),
      check(
        'chk_medical_purchase_orders_cancel_reason_when_cancelled',
        sql`(${table.stage} = 'cancelled') = (${table.cancel_reason} IS NOT NULL)`,
      ),
      check('chk_medical_purchase_orders_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_medical_purchase_orders_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_medical_purchase_orders_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_medical_purchase_orders_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('medical_purchase_orders_tenant_isolation', {
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
