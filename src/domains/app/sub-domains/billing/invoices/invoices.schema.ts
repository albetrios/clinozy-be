import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgPolicy,
  primaryKey,
  smallint,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { medicines } from '@/domains/app/sub-domains/medicines/medicines.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patient_offering_suggestions } from '@/domains/app/sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.schema.js';
import { patient_prescriptions } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  INVOICE_ITEM_GST_PERCENT_VALUES,
  INVOICE_ITEM_QUANTITY_MAX,
  INVOICE_ITEMS_MAX,
  INVOICE_TYPE,
  INVOICE_TYPE_VALUES,
} from '@/domains/app/sub-domains/billing/invoices/invoices.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` CHECK. */
function literalList(values: readonly (string | number)[]): SQL {
  return sql.raw(
    values.map((value) => (typeof value === 'number' ? String(value) : `'${value}'`)).join(', '),
  );
}

/** A literal number in a CHECK. */
function literalNumber(value: number): SQL {
  return sql.raw(String(value));
}

/**
 * Drizzle table for `app.invoices` — one bill, clinic, consultation or medical (launch ROUTE #136,
 * routes-final 8.A).
 *
 * @remarks
 * - **Notes:** two numbers from triggers, never reused (B11) — `invoice_sequence` ("#1042",
 *   organization-wide) and the statutory `invoice_number` per branch and financial year
 *   ("2026-27/0412", `trg_invoices_invoice_number`); the amounts are computed and stored by the
 *   server (B5, B9), `paid_amount` kept by the payment writes, `due_amount` and `payment_status`
 *   generated. The billed person is a contact — required but for a `medical` invoice (B3); the
 *   branch is fixed (B4). Its lines are `app.invoice_items`, its credited team
 *   `app.invoice_members`. RLS on the organization GUC with the retention-cleanup arm for the purge;
 *   the branch is an application filter.
 */
export const invoices = appSchema
  .table(
    'invoices',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      invoice_sequence: integer('invoice_sequence').notNull().default(0),
      // Set by `trg_invoices_invoice_number` (B11)
      invoice_number: varchar('invoice_number', { length: 30 }).notNull().default(''),
      financial_year: varchar('financial_year', { length: 9 }).notNull().default(''),
      type: varchar('type', { length: 12 }).notNull().default('clinic'),
      branch_id: bigint('branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'restrict' }),
      contact_id: bigint('contact_id', { mode: 'number' }).references(
        (): AnyPgColumn => contacts.id,
        { onDelete: 'restrict' },
      ),
      invoice_date: date('invoice_date', { mode: 'string' }).notNull(),
      overall_discount: numeric('overall_discount', { precision: 12, scale: 2 })
        .notNull()
        .default('0.00'),
      subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0.00'),
      discount_total: numeric('discount_total', { precision: 12, scale: 2 })
        .notNull()
        .default('0.00'),
      taxable_total: numeric('taxable_total', { precision: 12, scale: 2 })
        .notNull()
        .default('0.00'),
      gst_total: numeric('gst_total', { precision: 12, scale: 2 }).notNull().default('0.00'),
      total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0.00'),
      // Kept by every payment write in its transaction (B5, B21)
      paid_amount: numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
      due_amount: numeric('due_amount', { precision: 12, scale: 2 }).generatedAlwaysAs(
        (): SQL => sql`total - paid_amount`,
      ),
      payment_status: varchar('payment_status', { length: 7 }).generatedAlwaysAs(
        (): SQL =>
          sql`CASE WHEN total - paid_amount <= 0 THEN 'paid' WHEN paid_amount > 0 THEN 'partial' ELSE 'unpaid' END`,
      ),
      remark: varchar('remark', { length: 500 }),
      patient_prescription_id: bigint('patient_prescription_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_prescriptions.id,
        { onDelete: 'set null' },
      ),
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
      uniqueIndex('idx_invoices_public_id').on(table.public_id),
      uniqueIndex('idx_invoices_organization_invoice_sequence').on(
        table.organization_id,
        table.invoice_sequence,
      ),
      uniqueIndex('idx_invoices_branch_financial_year_number').on(
        table.organization_id,
        table.branch_id,
        table.financial_year,
        table.invoice_number,
      ),
      // The list, newest first
      index('idx_invoices_organization_invoice_date')
        .on(table.organization_id, table.invoice_date.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      // The patient file's Invoices tab
      index('idx_invoices_contact_invoice_date')
        .on(table.contact_id, table.invoice_date.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_invoices_branch_invoice_date')
        .on(table.branch_id, table.invoice_date)
        .where(sql`${table.deleted_at} IS NULL`),
      // Dues, and sub-domain 10's reminder
      index('idx_invoices_organization_due')
        .on(table.organization_id, table.invoice_date)
        .where(sql`${table.deleted_at} IS NULL AND ${table.due_amount} > 0`),
      index('idx_invoices_patient_prescription_id')
        .on(table.patient_prescription_id)
        .where(sql`${table.patient_prescription_id} IS NOT NULL`),
      index('idx_invoices_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_invoices_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_invoices_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_invoices_invoice_sequence', sql`${table.invoice_sequence} > 0`),
      check('chk_invoices_financial_year', sql`${table.financial_year} ~ '^\\d{4}-\\d{2}$'`),
      check('chk_invoices_type', sql`${table.type} IN (${literalList(INVOICE_TYPE_VALUES)})`),
      check(
        'chk_invoices_contact_unless_medical',
        sql`${table.contact_id} IS NOT NULL OR ${table.type} = '${sql.raw(INVOICE_TYPE.MEDICAL)}'`,
      ),
      check('chk_invoices_overall_discount', sql`${table.overall_discount} >= 0`),
      check(
        'chk_invoices_amounts',
        sql`${table.subtotal} >= 0 AND ${table.discount_total} >= 0 AND ${table.taxable_total} >= 0 AND ${table.gst_total} >= 0`,
      ),
      check(
        'chk_invoices_total',
        sql`${table.total} = ${table.taxable_total} + ${table.gst_total}`,
      ),
      check(
        'chk_invoices_paid_amount',
        sql`${table.paid_amount} >= 0 AND ${table.paid_amount} <= ${table.total}`,
      ),
      check('chk_invoices_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_invoices_delete_reason',
        sql`${table.delete_reason} IN (${literalList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_invoices_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_invoices_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('invoices_tenant_isolation', {
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
 * Drizzle table for `app.invoice_items` — an invoice's lines: an offering or a medicine, with its
 * snapshot rate and GST and the amounts the server computed (launch ROUTE #136, routes-final 8.A,
 * B5, B9).
 *
 * @remarks
 * - **Notes:** exactly one of the offering and the medicine; `line_number` 1–50, unique per invoice
 *   — a constraint the init migration makes deferrable, so a save can renumber kept lines; a removed
 *   line is deleted, and the rows go with their invoice (`CASCADE`). The plan row it invoices
 *   (`patient_offering_suggestion_id`, PK7); the patient offering it sold points back at it
 *   (`patient_offerings.invoice_item_id`, PK4). RLS on the organization GUC; the branch through its
 *   invoice.
 */
export const invoice_items = appSchema
  .table(
    'invoice_items',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      invoice_id: bigint('invoice_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => invoices.id, { onDelete: 'cascade' }),
      line_number: smallint('line_number').notNull(),
      offering_id: bigint('offering_id', { mode: 'number' }).references(
        (): AnyPgColumn => offerings.id,
        { onDelete: 'restrict' },
      ),
      medicine_id: bigint('medicine_id', { mode: 'number' }).references(
        (): AnyPgColumn => medicines.id,
        { onDelete: 'restrict' },
      ),
      // Snapshots of the offering or medicine when billed (B9)
      name: varchar('name', { length: 120 }).notNull(),
      pack_size: varchar('pack_size', { length: 30 }),
      quantity: smallint('quantity').notNull(),
      rate: numeric('rate', { precision: 12, scale: 2 }).notNull(),
      discount_percent: numeric('discount_percent', { precision: 5, scale: 2 })
        .notNull()
        .default('0.00'),
      // The line's discount and its share of the overall discount
      discount_amount: numeric('discount_amount', { precision: 12, scale: 2 })
        .notNull()
        .default('0.00'),
      gst_percent: smallint('gst_percent').notNull(),
      is_gst_inclusive: boolean('is_gst_inclusive').notNull(),
      taxable_amount: numeric('taxable_amount', { precision: 12, scale: 2 }).notNull(),
      gst_amount: numeric('gst_amount', { precision: 12, scale: 2 }).notNull(),
      amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
      // The plan row it invoices (PK7)
      patient_offering_suggestion_id: bigint('patient_offering_suggestion_id', {
        mode: 'number',
      }).references((): AnyPgColumn => patient_offering_suggestions.id, { onDelete: 'set null' }),
      batch_number: varchar('batch_number', { length: 20 }),
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
      uniqueIndex('idx_invoice_items_public_id').on(table.public_id),
      // Deferrable in the init migration — a save renumbers kept lines (B12)
      unique('uq_invoice_items_invoice_line').on(table.invoice_id, table.line_number),
      index('idx_invoice_items_offering_id')
        .on(table.offering_id)
        .where(sql`${table.offering_id} IS NOT NULL`),
      index('idx_invoice_items_medicine_id')
        .on(table.medicine_id)
        .where(sql`${table.medicine_id} IS NOT NULL`),
      index('idx_invoice_items_patient_offering_suggestion_id')
        .on(table.patient_offering_suggestion_id)
        .where(sql`${table.patient_offering_suggestion_id} IS NOT NULL`),
      index('idx_invoice_items_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_invoice_items_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check(
        'chk_invoice_items_line_number',
        sql`${table.line_number} BETWEEN 1 AND ${literalNumber(INVOICE_ITEMS_MAX)}`,
      ),
      check(
        'chk_invoice_items_one_item',
        sql`num_nonnulls(${table.offering_id}, ${table.medicine_id}) = 1`,
      ),
      check('chk_invoice_items_name', sql`char_length(${table.name}) > 0`),
      check(
        'chk_invoice_items_quantity',
        sql`${table.quantity} BETWEEN 1 AND ${literalNumber(INVOICE_ITEM_QUANTITY_MAX)}`,
      ),
      check('chk_invoice_items_rate', sql`${table.rate} >= 0`),
      check('chk_invoice_items_discount_percent', sql`${table.discount_percent} BETWEEN 0 AND 100`),
      check(
        'chk_invoice_items_gst_percent',
        sql`${table.gst_percent} IN (${literalList(INVOICE_ITEM_GST_PERCENT_VALUES)})`,
      ),
      check(
        'chk_invoice_items_amounts',
        sql`${table.discount_amount} >= 0 AND ${table.taxable_amount} >= 0 AND ${table.gst_amount} >= 0 AND ${table.amount} >= 0`,
      ),
      check('chk_invoice_items_updated', sql`${table.updated_at} >= ${table.created_at}`),
      pgPolicy('invoice_items_tenant_isolation', {
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

/**
 * Drizzle link table `app.invoice_members` — who an invoice credits (launch ROUTE #136,
 * routes-final 8.A, B15; was `app.invoice_team_memberships`).
 *
 * @remarks
 * - **Notes:** key (`invoice_id`, `membership_id`); goes with its invoice (`CASCADE`); the member a
 *   K8 composite key `RESTRICT` — a credited member stays listed after leaving (K2). Up to 10 per
 *   invoice (the service). RLS on the organization GUC.
 */
export const invoice_members = appSchema
  .table(
    'invoice_members',
    {
      invoice_id: bigint('invoice_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => invoices.id, { onDelete: 'cascade' }),
      membership_id: bigint('membership_id', { mode: 'number' }).notNull(),
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
        name: 'invoice_members_pkey',
        columns: [table.invoice_id, table.membership_id],
      }),
      // K8: a member of this organization, kept when they leave (K2)
      foreignKey({
        name: 'invoice_members_membership_fk',
        columns: [table.organization_id, table.membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      // A member's billing, and the composite key's lookups
      index('idx_invoice_members_organization_id_membership_id').on(
        table.organization_id,
        table.membership_id,
        table.invoice_id,
      ),
      index('idx_invoice_members_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('invoice_members_tenant_isolation', {
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
