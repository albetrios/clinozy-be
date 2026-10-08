import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  foreignKey,
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
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { invoice_credit_notes } from '@/domains/app/sub-domains/billing/invoice-credit-notes/invoice-credit-notes.schema.js';
import { pending_credits } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  PAYMENT_ATTACHMENT_KEYS_MAX,
  PAYMENT_DIRECTION,
  PAYMENT_DIRECTION_VALUES,
  PAYMENT_EXPENSE_CATEGORY_VALUES,
  PAYMENT_KIND,
  PAYMENT_KIND_VALUES,
  PAYMENT_PAYEE_KIND_VALUES,
  PAYMENT_RECEIVED_KIND_VALUES,
} from '@/domains/app/sub-domains/billing/payments/payments.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` CHECK. */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/** A value as a SQL literal. */
function literal(value: string | number): SQL {
  return sql.raw(typeof value === 'number' ? String(value) : `'${value}'`);
}

/**
 * Drizzle table for `app.payments` — one entry in or out of a branch's money (launch ROUTE #136,
 * routes-final 8.C).
 *
 * @remarks
 * - **Notes:** the kind fixes the direction (B17, `chk_payments_kind_direction` — a reversal runs
 *   opposite to what it undoes); the splits are columns that add up to `amount` (B18), `credit`
 *   only with a pending credit; a receipt names its contact; a reversal points at what it undoes,
 *   once (unique). Its day — the organization date of `paid_at` — locks it once closed (B6, the
 *   service). "PAY-12" from the record counter. RLS on the organization GUC with the
 *   retention-cleanup arm for the purge; the branch is an application filter.
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
      payment_number: integer('payment_number').notNull().default(0),
      direction: varchar('direction', { length: 8 }).notNull(),
      kind: varchar('kind', { length: 13 }).notNull(),
      branch_id: bigint('branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'restrict' }),
      amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
      // The splits (B18)
      cash_amount: numeric('cash_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
      upi_amount: numeric('upi_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
      card_amount: numeric('card_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
      credit_amount: numeric('credit_amount', { precision: 12, scale: 2 })
        .notNull()
        .default('0.00'),
      paid_at: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
      contact_id: bigint('contact_id', { mode: 'number' }).references(
        (): AnyPgColumn => contacts.id,
        { onDelete: 'restrict' },
      ),
      invoice_id: bigint('invoice_id', { mode: 'number' }).references(
        (): AnyPgColumn => invoices.id,
        { onDelete: 'restrict' },
      ),
      invoice_credit_note_id: bigint('invoice_credit_note_id', { mode: 'number' }).references(
        (): AnyPgColumn => invoice_credit_notes.id,
        { onDelete: 'restrict' },
      ),
      pending_credit_id: bigint('pending_credit_id', { mode: 'number' }).references(
        (): AnyPgColumn => pending_credits.id,
        { onDelete: 'restrict' },
      ),
      reverses_payment_id: bigint('reverses_payment_id', { mode: 'number' }).references(
        (): AnyPgColumn => payments.id,
        { onDelete: 'restrict' },
      ),
      payee_name: varchar('payee_name', { length: 120 }),
      expense_category: varchar('expense_category', { length: 11 }),
      reference: varchar('reference', { length: 60 }),
      note: varchar('note', { length: 280 }),
      attachment_keys: text('attachment_keys').array().notNull().default([]),
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
      uniqueIndex('idx_payments_organization_payment_number').on(
        table.organization_id,
        table.payment_number,
      ),
      // The ledger, newest first
      index('idx_payments_organization_paid_at')
        .on(table.organization_id, table.paid_at.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      // The day close's sums
      index('idx_payments_branch_paid_at')
        .on(table.branch_id, table.paid_at)
        .where(sql`${table.deleted_at} IS NULL`),
      // The patient file's Payments tab
      index('idx_payments_contact_paid_at')
        .on(table.contact_id, table.paid_at.desc())
        .where(sql`${table.deleted_at} IS NULL AND ${table.contact_id} IS NOT NULL`),
      index('idx_payments_invoice_id')
        .on(table.invoice_id)
        .where(sql`${table.invoice_id} IS NOT NULL`),
      index('idx_payments_pending_credit_id')
        .on(table.pending_credit_id)
        .where(sql`${table.pending_credit_id} IS NOT NULL`),
      uniqueIndex('idx_payments_reverses_payment_id')
        .on(table.reverses_payment_id)
        .where(sql`${table.reverses_payment_id} IS NOT NULL`),
      uniqueIndex('idx_payments_invoice_credit_note_id')
        .on(table.invoice_credit_note_id)
        .where(sql`${table.invoice_credit_note_id} IS NOT NULL`),
      index('idx_payments_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_payments_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_payments_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_payments_payment_number', sql`${table.payment_number} > 0`),
      check(
        'chk_payments_direction',
        sql`${table.direction} IN (${literalList(PAYMENT_DIRECTION_VALUES)})`,
      ),
      check('chk_payments_kind', sql`${table.kind} IN (${literalList(PAYMENT_KIND_VALUES)})`),
      // B17: the kind fixes the direction; a reversal runs opposite to what it undoes
      check(
        'chk_payments_kind_direction',
        sql`${table.kind} = ${literal(PAYMENT_KIND.REVERSAL)} OR (${table.direction} = ${literal(PAYMENT_DIRECTION.RECEIVED)}) = (${table.kind} IN (${literalList(PAYMENT_RECEIVED_KIND_VALUES)}))`,
      ),
      check('chk_payments_amount', sql`${table.amount} > 0`),
      // B18: the splits add up
      check(
        'chk_payments_splits',
        sql`${table.cash_amount} >= 0 AND ${table.upi_amount} >= 0 AND ${table.card_amount} >= 0 AND ${table.credit_amount} >= 0 AND ${table.cash_amount} + ${table.upi_amount} + ${table.card_amount} + ${table.credit_amount} = ${table.amount}`,
      ),
      check(
        'chk_payments_credit_with_pending_credit',
        sql`${table.credit_amount} = 0 OR ${table.pending_credit_id} IS NOT NULL`,
      ),
      check(
        'chk_payments_receipt_contact',
        sql`${table.kind} <> ${literal(PAYMENT_KIND.RECEIPT)} OR ${table.contact_id} IS NOT NULL`,
      ),
      check(
        'chk_payments_reversal',
        sql`(${table.kind} = ${literal(PAYMENT_KIND.REVERSAL)}) = (${table.reverses_payment_id} IS NOT NULL)`,
      ),
      check(
        'chk_payments_payee',
        sql`${table.kind} NOT IN (${literalList(PAYMENT_PAYEE_KIND_VALUES)}) OR ${table.payee_name} IS NOT NULL`,
      ),
      check(
        'chk_payments_expense_category',
        sql`(${table.kind} = ${literal(PAYMENT_KIND.EXPENSE)}) = (${table.expense_category} IS NOT NULL) AND (${table.expense_category} IS NULL OR ${table.expense_category} IN (${literalList(PAYMENT_EXPENSE_CATEGORY_VALUES)}))`,
      ),
      check(
        'chk_payments_attachment_keys',
        sql`cardinality(${table.attachment_keys}) <= ${literal(PAYMENT_ATTACHMENT_KEYS_MAX)}`,
      ),
      check('chk_payments_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_payments_delete_reason',
        sql`${table.delete_reason} IN (${literalList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_payments_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_payments_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
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

/**
 * Drizzle table for `app.payment_edits` — what one change to a payment changed (launch ROUTE #136,
 * routes-final 8.C, B20).
 *
 * @remarks
 * - **Notes:** append-only — no `updated_*` or soft-delete columns; `changes` is
 *   `{ field: { from, to } }` with the changed fields only; goes with its payment (`CASCADE`); the
 *   author a K8 composite key `RESTRICT` (K2). Written in the change's transaction. RLS on the
 *   organization GUC.
 */
export const payment_edits = appSchema
  .table(
    'payment_edits',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      payment_id: bigint('payment_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => payments.id, { onDelete: 'cascade' }),
      changes: jsonb('changes').notNull(),
      // The caller (the ledger's "by")
      author_membership_id: bigint('author_membership_id', { mode: 'number' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      uniqueIndex('idx_payment_edits_public_id').on(table.public_id),
      index('idx_payment_edits_payment_created').on(table.payment_id, table.created_at.desc()),
      index('idx_payment_edits_author_membership_id')
        .on(table.organization_id, table.author_membership_id)
        .where(sql`${table.author_membership_id} IS NOT NULL`),
      index('idx_payment_edits_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      // K8: a member of this organization, kept when they leave (K2)
      foreignKey({
        name: 'payment_edits_author_membership_fk',
        columns: [table.organization_id, table.author_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      check('chk_payment_edits_changes', sql`jsonb_typeof(${table.changes}) = 'object'`),
      pgPolicy('payment_edits_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`,
        withCheck: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`,
      }),
    ],
  )
  .enableRLS();
