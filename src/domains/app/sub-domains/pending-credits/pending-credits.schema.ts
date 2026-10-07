import { sql, type SQL } from 'drizzle-orm';
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
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { invoices } from '@/domains/app/sub-domains/invoices/invoices.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { payments } from '@/domains/app/sub-domains/payments/payments.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  PENDING_CREDIT_DIRECTION_VALUES,
  PENDING_CREDIT_PARTY_KIND_VALUES,
  PENDING_CREDIT_STATUS_VALUES,
} from '@/domains/app/sub-domains/pending-credits/pending-credits.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.pending_credits` — Money owed to or by someone, to settle later (launch ROUTE #37, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `pending_credits_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
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
      // The "CR-2" running number
      pending_credit_number: integer('pending_credit_number').notNull().default(0),
      direction: varchar('direction', { length: 4 }).notNull(),
      party_kind: varchar('party_kind', { length: 8 }).notNull().default('patient'),
      party_name: varchar('party_name', { length: 120 }).notNull(),
      patient_id: bigint('patient_id', { mode: 'number' }).references(
        (): AnyPgColumn => patients.id,
        { onDelete: 'set null' },
      ),
      amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
      reason: varchar('reason', { length: 280 }).notNull(),
      source_payment_id: bigint('source_payment_id', { mode: 'number' }).references(
        (): AnyPgColumn => payments.id,
        { onDelete: 'set null' },
      ),
      status: varchar('status', { length: 10 }).notNull().default('open'),
      settled_payment_id: bigint('settled_payment_id', { mode: 'number' }).references(
        (): AnyPgColumn => payments.id,
        { onDelete: 'set null' },
      ),
      invoice_id: bigint('invoice_id', { mode: 'number' }).references(
        (): AnyPgColumn => invoices.id,
        { onDelete: 'set null' },
      ),
      settle_by: date('settle_by', { mode: 'string' }),
      settled_amount: numeric('settled_amount', { precision: 12, scale: 2 })
        .notNull()
        .default('0.00'),
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
      uniqueIndex('idx_pending_credits_public_id').on(table.public_id),
      index('idx_pending_credits_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_pending_credits_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_pending_credits_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_pending_credits_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_pending_credits_patient_id')
        .on(table.patient_id)
        .where(sql`${table.patient_id} IS NOT NULL`),
      index('idx_pending_credits_source_payment_id')
        .on(table.source_payment_id)
        .where(sql`${table.source_payment_id} IS NOT NULL`),
      index('idx_pending_credits_settled_payment_id')
        .on(table.settled_payment_id)
        .where(sql`${table.settled_payment_id} IS NOT NULL`),
      index('idx_pending_credits_invoice_id')
        .on(table.invoice_id)
        .where(sql`${table.invoice_id} IS NOT NULL`),
      index('idx_pending_credits_organization_settle_by')
        .on(table.organization_id, table.settle_by, table.id)
        .where(sql`${table.deleted_at} IS NULL AND ${table.settle_by} IS NOT NULL`),
      uniqueIndex('idx_pending_credits_organization_pending_credit_number').on(
        table.organization_id,
        table.pending_credit_number,
      ),
      check('chk_pending_credits_pending_credit_number', sql`${table.pending_credit_number} > 0`),
      check(
        'chk_pending_credits_direction',
        sql`${table.direction} IN (${joinValues(PENDING_CREDIT_DIRECTION_VALUES)})`,
      ),
      check(
        'chk_pending_credits_party_kind',
        sql`${table.party_kind} IN (${joinValues(PENDING_CREDIT_PARTY_KIND_VALUES)})`,
      ),
      check('chk_pending_credits_amount', sql`${table.amount} >= 0`),
      check(
        'chk_pending_credits_status',
        sql`${table.status} IN (${joinValues(PENDING_CREDIT_STATUS_VALUES)})`,
      ),
      check('chk_pending_credits_settled_amount', sql`${table.settled_amount} >= 0`),
      check('chk_pending_credits_amount_positive', sql`${table.amount} > 0`),
      check(
        'chk_pending_credits_settled_within_amount',
        sql`${table.settled_amount} <= ${table.amount}`,
      ),
      check('chk_pending_credits_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_pending_credits_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_pending_credits_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_pending_credits_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
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
