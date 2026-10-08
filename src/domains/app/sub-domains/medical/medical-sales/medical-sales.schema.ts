import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgPolicy,
  primaryKey,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import {
  invoice_items,
  invoices,
} from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { invoice_credit_notes } from '@/domains/app/sub-domains/billing/invoice-credit-notes/invoice-credit-notes.schema.js';
import { patient_prescriptions } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.schema.js';
import {
  MEDICAL_SALE_REFUND_MODE_VALUES,
  MEDICAL_SALE_RETURN_REASON_VALUES,
  MEDICAL_SALE_VOID_REASON_VALUES,
} from './medical-sales.constants.js';

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
 * Drizzle table for `app.medical_sales` — one sale of the medical store and its `medical` invoice
 * (launch ROUTE #153, routes-final 11.H).
 *
 * @remarks
 * - **Notes:** one invoice per sale (unique); the buyer is a contact (MD6), the branch is the
 *   invoice's (MD3); a prescription is filled by one live sale. Never edited; the void is the soft
 *   delete, with its own reasons (MD20). The invoice, contact and branch stay (`RESTRICT`). RLS on
 *   the organization GUC with the retention-cleanup arm for the purge.
 */
export const medical_sales = appSchema
  .table(
    'medical_sales',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      sale_number: integer('sale_number').notNull().default(0),
      invoice_id: bigint('invoice_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => invoices.id, { onDelete: 'restrict' }),
      contact_id: bigint('contact_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => contacts.id, { onDelete: 'restrict' }),
      branch_id: bigint('branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'restrict' }),
      patient_prescription_id: bigint('patient_prescription_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_prescriptions.id,
        { onDelete: 'set null' },
      ),
      sold_at: timestamp('sold_at', { withTimezone: true }).notNull().defaultNow(),
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
      uniqueIndex('idx_medical_sales_public_id').on(table.public_id),
      uniqueIndex('idx_medical_sales_organization_sale_number').on(
        table.organization_id,
        table.sale_number,
      ),
      uniqueIndex('idx_medical_sales_invoice_id').on(table.invoice_id),
      // A prescription is filled by one live sale (MD19)
      uniqueIndex('idx_medical_sales_patient_prescription_unique')
        .on(table.patient_prescription_id)
        .where(sql`${table.deleted_at} IS NULL AND ${table.patient_prescription_id} IS NOT NULL`),
      index('idx_medical_sales_organization_sold')
        .on(table.organization_id, table.sold_at.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_medical_sales_organization_created')
        .on(table.organization_id, table.created_at.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_medical_sales_contact_id').on(table.contact_id),
      index('idx_medical_sales_branch_id').on(table.branch_id),
      index('idx_medical_sales_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_medical_sales_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_medical_sales_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_medical_sales_sale_number', sql`${table.sale_number} > 0`),
      check('chk_medical_sales_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_medical_sales_delete_reason',
        sql`${table.delete_reason} IN (${literalList(MEDICAL_SALE_VOID_REASON_VALUES)})`,
      ),
      check(
        'chk_medical_sales_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_medical_sales_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('medical_sales_tenant_isolation', {
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
 * Drizzle table `app.medical_sale_returns` — medicines brought back and their refund (launch
 * ROUTE #153, MD21); no routes of its own (K1) — written by the sale's return route.
 *
 * @remarks
 * - **Notes:** append-only; its credit note (8, B16) carries the refund (unique); who took it back
 *   is K8's composite key (`RESTRICT`, K2). The sale stays while returns name it (`RESTRICT`). RLS
 *   on the organization GUC.
 */
export const medical_sale_returns = appSchema
  .table(
    'medical_sale_returns',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      medical_sale_id: bigint('medical_sale_id', { mode: 'number' })
        .notNull()
        .references(() => medical_sales.id, { onDelete: 'restrict' }),
      reason: varchar('reason', { length: 14 }).notNull(),
      refund_mode: varchar('refund_mode', { length: 4 }).notNull(),
      note: varchar('note', { length: 280 }),
      amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
      invoice_credit_note_id: bigint('invoice_credit_note_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => invoice_credit_notes.id, { onDelete: 'restrict' }),
      returned_by_membership_id: bigint('returned_by_membership_id', { mode: 'number' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      uniqueIndex('idx_medical_sale_returns_public_id').on(table.public_id),
      uniqueIndex('idx_medical_sale_returns_invoice_credit_note_id').on(
        table.invoice_credit_note_id,
      ),
      index('idx_medical_sale_returns_sale_created').on(
        table.medical_sale_id,
        table.created_at,
        table.id,
      ),
      index('idx_medical_sale_returns_organization_id').on(table.organization_id),
      index('idx_medical_sale_returns_returned_by_membership_id')
        .on(table.returned_by_membership_id)
        .where(sql`${table.returned_by_membership_id} IS NOT NULL`),
      index('idx_medical_sale_returns_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      check(
        'chk_medical_sale_returns_reason',
        sql`${table.reason} IN (${literalList(MEDICAL_SALE_RETURN_REASON_VALUES)})`,
      ),
      check(
        'chk_medical_sale_returns_refund_mode',
        sql`${table.refund_mode} IN (${literalList(MEDICAL_SALE_REFUND_MODE_VALUES)})`,
      ),
      check('chk_medical_sale_returns_amount', sql`${table.amount} > 0`),
      foreignKey({
        name: 'medical_sale_returns_returned_by_membership_fk',
        columns: [table.organization_id, table.returned_by_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      pgPolicy('medical_sale_returns_tenant_isolation', {
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
 * Drizzle table `app.medical_sale_return_items` — one returned invoice line (launch ROUTE #153,
 * MD21); no routes of its own (K1).
 *
 * @remarks
 * - **Notes:** `is_restocked` — the quantity went back into the line's batch (`unused`,
 *   `doctor_changed`, `wrong_item`), else it was written off. The invoice line stays
 *   (`RESTRICT`); the row goes with its return. RLS on the organization GUC.
 */
export const medical_sale_return_items = appSchema
  .table(
    'medical_sale_return_items',
    {
      medical_sale_return_id: bigint('medical_sale_return_id', { mode: 'number' })
        .notNull()
        .references(() => medical_sale_returns.id, { onDelete: 'cascade' }),
      invoice_item_id: bigint('invoice_item_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => invoice_items.id, { onDelete: 'restrict' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      quantity: integer('quantity').notNull(),
      amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
      is_restocked: boolean('is_restocked').notNull(),
    },
    (table) => [
      primaryKey({
        name: 'medical_sale_return_items_pkey',
        columns: [table.medical_sale_return_id, table.invoice_item_id],
      }),
      index('idx_medical_sale_return_items_invoice_item_id').on(table.invoice_item_id),
      index('idx_medical_sale_return_items_organization_id').on(table.organization_id),
      check('chk_medical_sale_return_items_quantity', sql`${table.quantity} > 0`),
      check('chk_medical_sale_return_items_amount', sql`${table.amount} >= 0`),
      pgPolicy('medical_sale_return_items_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
        withCheck: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
      }),
    ],
  )
  .enableRLS();
