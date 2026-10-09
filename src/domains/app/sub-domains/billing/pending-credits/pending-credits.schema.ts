import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  date,
  index,
  integer,
  numeric,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteral, sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { payments } from '@/domains/app/sub-domains/billing/payments/payments.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  PENDING_CREDIT_DIRECTION_VALUES,
  PENDING_CREDIT_STATUS,
  PENDING_CREDIT_STATUS_VALUES,
} from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.constants.js';

/** `'open'` as a SQL literal. */
const OPEN = sqlLiteral(PENDING_CREDIT_STATUS.OPEN);

/**
 * Drizzle table for `app.pending_credits` — money owed to or by someone, settled in parts by
 * payments (launch ROUTE #136, routes-final 8.D).
 *
 * @remarks
 * - **Notes:** a contact or a typed name (B23); `settled_amount` is its settlements' total, kept in
 *   their transaction (B24), `0 ≤ settled ≤ amount`, and the status is `open` exactly while some is
 *   left (`chk_pending_credits_status_open`). "CR-2" from the record counter. RLS on the
 *   organization GUC with the retention-cleanup arm for the purge; the organization's, not a
 *   branch's (B4).
 */
export const pending_credits = appSchema
  .table(
    'pending_credits',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      pending_credit_number: integer('pending_credit_number').notNull().default(0),
      direction: varchar('direction', { length: 4 }).notNull(),
      contact_id: bigint('contact_id', { mode: 'number' }).references(
        (): AnyPgColumn => contacts.id,
        { onDelete: 'restrict' },
      ),
      party_name: varchar('party_name', { length: 120 }),
      amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
      settled_amount: numeric('settled_amount', { precision: 12, scale: 2 })
        .notNull()
        .default('0.00'),
      status: varchar('status', { length: 10 }).notNull().default('open'),
      reason: varchar('reason', { length: 280 }).notNull(),
      note: varchar('note', { length: 300 }),
      // "For invoice"
      invoice_id: bigint('invoice_id', { mode: 'number' }).references(
        (): AnyPgColumn => invoices.id,
        { onDelete: 'set null' },
      ),
      source_payment_id: bigint('source_payment_id', { mode: 'number' }).references(
        (): AnyPgColumn => payments.id,
        { onDelete: 'set null' },
      ),
      // Sub-domain 10's reminder
      settle_by: date('settle_by', { mode: 'string' }),
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
      uniqueIndex('idx_pending_credits_public_id').on(table.public_id),
      uniqueIndex('idx_pending_credits_organization_number').on(
        table.organization_id,
        table.pending_credit_number,
      ),
      index('idx_pending_credits_organization_created')
        .on(table.organization_id, table.created_at.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      // Sub-domain 10's reminder
      index('idx_pending_credits_organization_settle_by')
        .on(table.organization_id, table.settle_by)
        .where(sql`${table.deleted_at} IS NULL AND ${table.status} = ${OPEN}`),
      index('idx_pending_credits_contact_id')
        .on(table.contact_id)
        .where(sql`${table.contact_id} IS NOT NULL`),
      index('idx_pending_credits_invoice_id')
        .on(table.invoice_id)
        .where(sql`${table.invoice_id} IS NOT NULL`),
      index('idx_pending_credits_source_payment_id')
        .on(table.source_payment_id)
        .where(sql`${table.source_payment_id} IS NOT NULL`),
      index('idx_pending_credits_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_pending_credits_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_pending_credits_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_pending_credits_number', sql`${table.pending_credit_number} > 0`),
      check(
        'chk_pending_credits_direction',
        sql`${table.direction} IN (${sqlLiteralList(PENDING_CREDIT_DIRECTION_VALUES)})`,
      ),
      check(
        'chk_pending_credits_party',
        sql`${table.contact_id} IS NOT NULL OR ${table.party_name} IS NOT NULL`,
      ),
      check('chk_pending_credits_amount', sql`${table.amount} > 0`),
      check(
        'chk_pending_credits_settled_amount',
        sql`${table.settled_amount} >= 0 AND ${table.settled_amount} <= ${table.amount}`,
      ),
      check(
        'chk_pending_credits_status',
        sql`${table.status} IN (${sqlLiteralList(PENDING_CREDIT_STATUS_VALUES)})`,
      ),
      check(
        'chk_pending_credits_status_open',
        sql`(${table.status} = ${OPEN}) = (${table.settled_amount} < ${table.amount})`,
      ),
      check('chk_pending_credits_reason', sql`char_length(${table.reason}) > 0`),
      check('chk_pending_credits_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_pending_credits_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_pending_credits_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_pending_credits_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('pending_credits_tenant_isolation', {
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
