import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  date,
  index,
  integer,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { invoices } from '@/domains/app/sub-domains/invoices/invoices.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.patient_packages` — A package a patient bought (or is about to) — its sessions and expiry (launch ROUTE #31, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `patient_packages_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const patient_packages = appSchema
  .table(
    'patient_packages',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      patient_id: bigint('patient_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => patients.id, { onDelete: 'no action' }),
      offering_id: bigint('offering_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => offerings.id, { onDelete: 'no action' }),
      invoice_id: bigint('invoice_id', { mode: 'number' }).references(
        (): AnyPgColumn => invoices.id,
        { onDelete: 'set null' },
      ),
      sessions_total: integer('sessions_total').notNull(),
      sessions_used: integer('sessions_used').notNull().default(0),
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
      uniqueIndex('idx_patient_packages_public_id').on(table.public_id),
      index('idx_patient_packages_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_patient_packages_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_patient_packages_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patient_packages_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_patient_packages_patient_created').on(
        table.patient_id,
        table.created_at,
        table.id,
      ),
      index('idx_patient_packages_offering_id').on(table.offering_id),
      index('idx_patient_packages_invoice_id')
        .on(table.invoice_id)
        .where(sql`${table.invoice_id} IS NOT NULL`),
      check('chk_patient_packages_sessions_total', sql`${table.sessions_total} BETWEEN 1 AND 99`),
      check('chk_patient_packages_sessions_used', sql`${table.sessions_used} BETWEEN 0 AND 99`),
      check(
        'chk_patient_packages_sessions_used_within_total',
        sql`${table.sessions_used} <= ${table.sessions_total}`,
      ),
      check('chk_patient_packages_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patient_packages_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patient_packages_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patient_packages_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('patient_packages_tenant_isolation', {
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
