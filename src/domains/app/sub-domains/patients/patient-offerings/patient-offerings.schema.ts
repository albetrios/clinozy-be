import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  date,
  index,
  pgPolicy,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { invoice_items } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import { PATIENT_OFFERING_SESSIONS_MAX } from '@/domains/app/sub-domains/patients/patient-offerings/patient-offerings.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` CHECK. */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/**
 * Drizzle table for `app.patient_offerings` — what a patient bought: an offering's sessions and
 * how long they last (launch ROUTE #135, routes-final 7.L).
 *
 * @remarks
 * - **Notes:** bought only by invoicing it (PK4) — written by the invoice service, its soft-delete
 *   columns only with its invoice; sessions move only with treatments (PK5) through one guarded
 *   update, `0 ≤ sessions_used ≤ sessions_total ≤ 999`; `valid_until` none = no expiry; one per
 *   invoice line (`invoice_item_id`, unique, `CASCADE` — held by its treatments' `RESTRICT`). The
 *   patient and the offering `ON DELETE RESTRICT`; the sessions-left index serves what a treatment
 *   can spend. RLS on the organization GUC with the retention-cleanup arm for the purge; not
 *   branch-scoped.
 */
export const patient_offerings = appSchema
  .table(
    'patient_offerings',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      patient_id: bigint('patient_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => patients.id, { onDelete: 'restrict' }),
      offering_id: bigint('offering_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => offerings.id, { onDelete: 'restrict' }),
      // The invoice line that sold it — one per line; it goes with its line (PK4)
      invoice_item_id: bigint('invoice_item_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => invoice_items.id, { onDelete: 'cascade' }),
      sessions_total: smallint('sessions_total').notNull(),
      sessions_used: smallint('sessions_used').notNull().default(0),
      // None = no expiry
      valid_until: date('valid_until', { mode: 'string' }),
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
      uniqueIndex('idx_patient_offerings_public_id').on(table.public_id),
      // The patient's tab, newest first
      index('idx_patient_offerings_patient_created')
        .on(table.patient_id, table.created_at.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      // What a treatment can spend (PK11)
      index('idx_patient_offerings_patient_offering_left')
        .on(table.patient_id, table.offering_id)
        .where(
          sql`${table.deleted_at} IS NULL AND ${table.sessions_used} < ${table.sessions_total}`,
        ),
      index('idx_patient_offerings_offering_id').on(table.offering_id),
      uniqueIndex('idx_patient_offerings_invoice_item_id').on(table.invoice_item_id),
      index('idx_patient_offerings_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_patient_offerings_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patient_offerings_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check(
        'chk_patient_offerings_sessions_total',
        sql`${table.sessions_total} BETWEEN 1 AND ${sql.raw(String(PATIENT_OFFERING_SESSIONS_MAX))}`,
      ),
      check(
        'chk_patient_offerings_sessions_used',
        sql`${table.sessions_used} >= 0 AND ${table.sessions_used} <= ${table.sessions_total}`,
      ),
      check('chk_patient_offerings_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patient_offerings_delete_reason',
        sql`${table.delete_reason} IN (${literalList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patient_offerings_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patient_offerings_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('patient_offerings_tenant_isolation', {
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
