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
  primaryKey,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { medical_contacts } from '@/domains/app/sub-domains/medical-contacts/medical-contacts.schema.js';
import { medical_sales } from '@/domains/app/sub-domains/medical-sales/medical-sales.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { prescriptions } from '@/domains/app/sub-domains/prescriptions/prescriptions.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import { INVOICE_TYPE_VALUES } from '@/domains/app/sub-domains/invoices/invoices.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.invoices` — A bill — clinic, consultation or medical — numbered per branch GSTIN and financial year (D23) (launch ROUTE #30, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `invoices_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
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
      // The organization-wide running number
      invoice_sequence: integer('invoice_sequence').notNull().default(0),
      // The printed number `2026-27/0042` — per branch (its GSTIN) and financial year (D23), set on insert
      invoice_number: varchar('invoice_number', { length: 30 }).notNull(),
      // April–March, e.g. 2026-27 — from the invoice date
      financial_year: varchar('financial_year', { length: 9 }).notNull(),
      type: varchar('type', { length: 12 }).notNull().default('clinic'),
      branch_id: bigint('branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'no action' }),
      patient_id: bigint('patient_id', { mode: 'number' }).references(
        (): AnyPgColumn => patients.id,
        { onDelete: 'no action' },
      ),
      items: jsonb('items').notNull().default([]),
      overall_discount: numeric('overall_discount', { precision: 12, scale: 2 })
        .notNull()
        .default('0.00'),
      invoice_date: date('invoice_date', { mode: 'string' }).notNull(),
      remark: varchar('remark', { length: 500 }),
      prescription_id: bigint('prescription_id', { mode: 'number' }).references(
        (): AnyPgColumn => prescriptions.id,
        { onDelete: 'set null' },
      ),
      medical_contact_id: bigint('medical_contact_id', { mode: 'number' }).references(
        (): AnyPgColumn => medical_contacts.id,
        { onDelete: 'set null' },
      ),
      medical_sale_id: bigint('medical_sale_id', { mode: 'number' }).references(
        (): AnyPgColumn => medical_sales.id,
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
      index('idx_invoices_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_invoices_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_invoices_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_invoices_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_invoices_branch_date').on(table.branch_id, table.invoice_date),
      index('idx_invoices_patient_id')
        .on(table.patient_id)
        .where(sql`${table.patient_id} IS NOT NULL`),
      index('idx_invoices_organization_invoice_date')
        .on(table.organization_id, table.invoice_date, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_invoices_prescription_id')
        .on(table.prescription_id)
        .where(sql`${table.prescription_id} IS NOT NULL`),
      index('idx_invoices_medical_contact_id')
        .on(table.medical_contact_id)
        .where(sql`${table.medical_contact_id} IS NOT NULL`),
      index('idx_invoices_medical_sale_id')
        .on(table.medical_sale_id)
        .where(sql`${table.medical_sale_id} IS NOT NULL`),
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
      check('chk_invoices_invoice_sequence', sql`${table.invoice_sequence} > 0`),
      check('chk_invoices_type', sql`${table.type} IN (${joinValues(INVOICE_TYPE_VALUES)})`),
      check('chk_invoices_overall_discount', sql`${table.overall_discount} >= 0`),
      check(
        'chk_invoices_patient_unless_medical',
        sql`${table.patient_id} IS NOT NULL OR ${table.type} = 'medical'`,
      ),
      check('chk_invoices_financial_year', sql`${table.financial_year} ~ '^\\d{4}-\\d{2}$'`),
      check('chk_invoices_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_invoices_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_invoices_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_invoices_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
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
 * Drizzle link table `app.invoice_team_memberships` — the `team_membership_ids` of an invoice (launch ROUTE #30).
 * One row per pair; removing either side removes the row. RLS on the organization GUC.
 */
export const invoice_team_memberships = appSchema
  .table(
    'invoice_team_memberships',
    {
      invoice_id: bigint('invoice_id', { mode: 'number' })
        .notNull()
        .references(() => invoices.id, { onDelete: 'cascade' }),
      team_membership_id: bigint('team_membership_id', { mode: 'number' })
        .notNull()
        .references(() => memberships.id, { onDelete: 'cascade' }),
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
        name: 'invoice_team_memberships_pkey',
        columns: [table.invoice_id, table.team_membership_id],
      }),
      index('idx_invoice_team_memberships_team_membership_id').on(table.team_membership_id),
      index('idx_invoice_team_memberships_organization_id').on(table.organization_id),
      index('idx_invoice_team_memberships_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('invoice_team_memberships_tenant_isolation', {
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
