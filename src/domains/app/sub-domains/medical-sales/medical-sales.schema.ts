import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { invoices } from '@/domains/app/sub-domains/invoices/invoices.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { medical_contacts } from '@/domains/app/sub-domains/medical-contacts/medical-contacts.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { prescriptions } from '@/domains/app/sub-domains/prescriptions/prescriptions.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import { MEDICAL_SALE_STATUS_VALUES } from '@/domains/app/sub-domains/medical-sales/medical-sales.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.medical_sales` — A sale over the store counter — never more than a batch holds, never an expired batch, never above MRP (D42) (launch ROUTE #51, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `medical_sales_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
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
      // The "S-983" running number
      sale_number: integer('sale_number').notNull().default(0),
      invoice_id: bigint('invoice_id', { mode: 'number' }).references(
        (): AnyPgColumn => invoices.id,
        { onDelete: 'set null' },
      ),
      patient_id: bigint('patient_id', { mode: 'number' }).references(
        (): AnyPgColumn => patients.id,
        { onDelete: 'no action' },
      ),
      medical_contact_id: bigint('medical_contact_id', { mode: 'number' }).references(
        (): AnyPgColumn => medical_contacts.id,
        { onDelete: 'no action' },
      ),
      prescription_id: bigint('prescription_id', { mode: 'number' }).references(
        (): AnyPgColumn => prescriptions.id,
        { onDelete: 'set null' },
      ),
      lead_id: bigint('lead_id', { mode: 'number' }).references((): AnyPgColumn => leads.id, {
        onDelete: 'set null',
      }),
      status: varchar('status', { length: 6 }).notNull().default('sold'),
      sold_at: timestamp('sold_at', { withTimezone: true }).notNull().defaultNow(),
      voided_at: timestamp('voided_at', { withTimezone: true }),
      returns: jsonb('returns').notNull().default([]),
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
      uniqueIndex('idx_medical_sales_public_id').on(table.public_id),
      index('idx_medical_sales_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_medical_sales_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_medical_sales_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_medical_sales_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_medical_sales_invoice_id')
        .on(table.invoice_id)
        .where(sql`${table.invoice_id} IS NOT NULL`),
      index('idx_medical_sales_patient_id')
        .on(table.patient_id)
        .where(sql`${table.patient_id} IS NOT NULL`),
      index('idx_medical_sales_medical_contact_id')
        .on(table.medical_contact_id)
        .where(sql`${table.medical_contact_id} IS NOT NULL`),
      index('idx_medical_sales_prescription_id')
        .on(table.prescription_id)
        .where(sql`${table.prescription_id} IS NOT NULL`),
      index('idx_medical_sales_lead_id').on(table.lead_id).where(sql`${table.lead_id} IS NOT NULL`),
      index('idx_medical_sales_organization_sold_at')
        .on(table.organization_id, table.sold_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      uniqueIndex('idx_medical_sales_organization_sale_number').on(
        table.organization_id,
        table.sale_number,
      ),
      check('chk_medical_sales_sale_number', sql`${table.sale_number} > 0`),
      check(
        'chk_medical_sales_status',
        sql`${table.status} IN (${joinValues(MEDICAL_SALE_STATUS_VALUES)})`,
      ),
      check(
        'chk_medical_sales_patient_or_contact',
        sql`${table.patient_id} IS NOT NULL OR ${table.medical_contact_id} IS NOT NULL`,
      ),
      check('chk_medical_sales_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_medical_sales_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_medical_sales_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_medical_sales_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('medical_sales_tenant_isolation', {
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
