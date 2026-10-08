import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  date,
  index,
  pgPolicy,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  PATIENT_REPORT_FILE_KEYS_MAX,
  PATIENT_REPORT_NOTES_MAX,
  PATIENT_REPORT_TYPE_VALUES,
} from '@/domains/app/sub-domains/patients/patient-reports/patient-reports.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` or `ARRAY[…]` CHECK. */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/**
 * Drizzle table for `app.patient_reports` — a lab, scan or consent document of a patient, up to ten
 * confirmed uploads (launch ROUTE #133, routes-final 7.G).
 *
 * @remarks
 * - **Notes:** clinical (P14, P29); `file_keys` holds confirmed uploads of the organization (checked
 *   by the application). The patient `ON DELETE RESTRICT` (P7). RLS on the organization GUC with
 *   the retention-cleanup arm for the deleted-record purge.
 */
export const patient_reports = appSchema
  .table(
    'patient_reports',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      patient_id: bigint('patient_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => patients.id, { onDelete: 'restrict' }),
      type: varchar('type', { length: 7 }).notNull().default('lab'),
      name: varchar('name', { length: 120 }).notNull(),
      report_date: date('report_date', { mode: 'string' }).notNull(),
      // Confirmed uploads of the organization (P29)
      file_keys: text('file_keys').array().notNull().default([]),
      notes: text('notes'),
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
      uniqueIndex('idx_patient_reports_public_id').on(table.public_id),
      index('idx_patient_reports_patient_report_date')
        .on(table.patient_id, table.report_date.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_patient_reports_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_patient_reports_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patient_reports_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check(
        'chk_patient_reports_type',
        sql`${table.type} IN (${literalList(PATIENT_REPORT_TYPE_VALUES)})`,
      ),
      check('chk_patient_reports_name', sql`char_length(${table.name}) > 0`),
      check(
        'chk_patient_reports_file_keys',
        sql`cardinality(${table.file_keys}) <= ${sql.raw(String(PATIENT_REPORT_FILE_KEYS_MAX))}`,
      ),
      check(
        'chk_patient_reports_notes',
        sql`char_length(${table.notes}) <= ${sql.raw(String(PATIENT_REPORT_NOTES_MAX))}`,
      ),
      check('chk_patient_reports_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patient_reports_delete_reason',
        sql`${table.delete_reason} IN (${literalList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patient_reports_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patient_reports_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('patient_reports_tenant_isolation', {
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
