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
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { credit_notes } from '@/domains/app/sub-domains/credit-notes/credit-notes.schema.js';
import { day_closes } from '@/domains/app/sub-domains/day-closes/day-closes.schema.js';
import { invoices } from '@/domains/app/sub-domains/invoices/invoices.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { pending_credits } from '@/domains/app/sub-domains/pending-credits/pending-credits.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  PAYMENT_DIRECTION_VALUES,
  PAYMENT_KIND_VALUES,
  PAYMENT_EXPENSE_CATEGORY_VALUES,
} from '@/domains/app/sub-domains/payments/payments.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.payments` — Money in or out — a receipt, refund, expense, supplier bill, money back or reversal (launch ROUTE #34, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `payments_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const payments = appSchema
  .table(
    'payments',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // The "PAY-5512" running number
      payment_number: integer('payment_number').notNull().default(0),
      direction: varchar('direction', { length: 8 }).notNull(),
      kind: varchar('kind', { length: 13 }).notNull(),
      branch_id: bigint('branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'no action' }),
      amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
      splits: jsonb('splits').notNull().default([]),
      patient_id: bigint('patient_id', { mode: 'number' }).references(
        (): AnyPgColumn => patients.id,
        { onDelete: 'set null' },
      ),
      invoice_id: bigint('invoice_id', { mode: 'number' }).references(
        (): AnyPgColumn => invoices.id,
        { onDelete: 'set null' },
      ),
      payee_name: varchar('payee_name', { length: 120 }),
      expense_category: varchar('expense_category', { length: 11 }),
      bill_ref: jsonb('bill_ref'),
      credit_note_id: bigint('credit_note_id', { mode: 'number' }).references(
        (): AnyPgColumn => credit_notes.id,
        { onDelete: 'set null' },
      ),
      pending_credit_id: bigint('pending_credit_id', { mode: 'number' }).references(
        (): AnyPgColumn => pending_credits.id,
        { onDelete: 'set null' },
      ),
      note: varchar('note', { length: 280 }),
      paid_at: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
      day_close_id: bigint('day_close_id', { mode: 'number' }).references(
        (): AnyPgColumn => day_closes.id,
        { onDelete: 'set null' },
      ),
      // One payment may cover several supplier bills (P58)
      bill_allocations: jsonb('bill_allocations').notNull().default([]),
      reference: varchar('reference', { length: 60 }),
      attachment_keys: text('attachment_keys').array().notNull().default([]),
      is_checked_at_close: boolean('is_checked_at_close').notNull().default(false),
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
      uniqueIndex('idx_payments_public_id').on(table.public_id),
      index('idx_payments_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_payments_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_payments_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_payments_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_payments_branch_paid').on(table.branch_id, table.paid_at),
      index('idx_payments_patient_id')
        .on(table.patient_id)
        .where(sql`${table.patient_id} IS NOT NULL`),
      index('idx_payments_invoice_id')
        .on(table.invoice_id)
        .where(sql`${table.invoice_id} IS NOT NULL`),
      index('idx_payments_credit_note_id')
        .on(table.credit_note_id)
        .where(sql`${table.credit_note_id} IS NOT NULL`),
      index('idx_payments_pending_credit_id')
        .on(table.pending_credit_id)
        .where(sql`${table.pending_credit_id} IS NOT NULL`),
      index('idx_payments_organization_paid_at')
        .on(table.organization_id, table.paid_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_payments_day_close_id')
        .on(table.day_close_id)
        .where(sql`${table.day_close_id} IS NOT NULL`),
      uniqueIndex('idx_payments_organization_payment_number').on(
        table.organization_id,
        table.payment_number,
      ),
      check('chk_payments_payment_number', sql`${table.payment_number} > 0`),
      check(
        'chk_payments_direction',
        sql`${table.direction} IN (${joinValues(PAYMENT_DIRECTION_VALUES)})`,
      ),
      check('chk_payments_kind', sql`${table.kind} IN (${joinValues(PAYMENT_KIND_VALUES)})`),
      check('chk_payments_amount', sql`${table.amount} >= 0`),
      check(
        'chk_payments_expense_category',
        sql`${table.expense_category} IN (${joinValues(PAYMENT_EXPENSE_CATEGORY_VALUES)})`,
      ),
      check('chk_payments_amount_positive', sql`${table.amount} > 0`),
      check(
        'chk_payments_payee_when_paid',
        sql`${table.direction} <> 'paid' OR ${table.payee_name} IS NOT NULL`,
      ),
      check(
        'chk_payments_expense_category_when_expense',
        sql`${table.kind} <> 'expense' OR ${table.expense_category} IS NOT NULL`,
      ),
      check('chk_payments_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_payments_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_payments_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_payments_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('payments_tenant_isolation', {
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
