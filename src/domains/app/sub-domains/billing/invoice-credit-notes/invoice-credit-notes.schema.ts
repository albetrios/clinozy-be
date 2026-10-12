import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  index,
  integer,
  numeric,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';

/**
 * Drizzle table for `app.invoice_credit_notes` — an invoice's refund document, written with its
 * refund payment (launch ROUTE #136, routes-final 8.B, B16; was `app.credit_notes`).
 *
 * @remarks
 * - **Notes:** "CN-001" from the record counter (`trg_invoice_credit_notes_credit_note_number`),
 *   never reused; `amount > 0`; never edited — its soft-delete columns are written only with its
 *   refund payment. The invoice `ON DELETE RESTRICT`. RLS on the organization GUC with the
 *   retention-cleanup arm for the purge; the branch through its invoice (B4).
 */
export const invoice_credit_notes = appSchema
  .table(
    'invoice_credit_notes',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      credit_note_number: integer('credit_note_number').notNull().default(0),
      invoice_id: bigint('invoice_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => invoices.id, { onDelete: 'restrict' }),
      amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
      reason: varchar('reason', { length: 280 }).notNull(),
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
      uniqueIndex('idx_invoice_credit_notes_public_id').on(table.public_id),
      uniqueIndex('idx_invoice_credit_notes_organization_number').on(
        table.organization_id,
        table.credit_note_number,
      ),
      index('idx_invoice_credit_notes_invoice_id').on(table.invoice_id),
      // Every credit note, newest first
      index('idx_invoice_credit_notes_organization_created')
        .on(table.organization_id, table.created_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_invoice_credit_notes_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_invoice_credit_notes_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_invoice_credit_notes_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_invoice_credit_notes_number', sql`${table.credit_note_number} > 0`),
      check('chk_invoice_credit_notes_amount', sql`${table.amount} > 0`),
      check('chk_invoice_credit_notes_reason', sql`char_length(${table.reason}) > 0`),
      check('chk_invoice_credit_notes_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_invoice_credit_notes_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_invoice_credit_notes_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_invoice_credit_notes_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('invoice_credit_notes_tenant_isolation', {
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
