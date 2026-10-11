import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  PATIENT_PRESCRIPTION_ITEMS_MAX,
  PATIENT_PRESCRIPTION_PRINT_LANGUAGE_VALUES,
  PATIENT_PRESCRIPTION_STATUS,
  PATIENT_PRESCRIPTION_STATUS_VALUES,
  PATIENT_PRESCRIPTION_TEXT_MAX,
} from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.constants.js';

/** `char_length(column) <= max` — a text column's length CHECK. */
function textAtMost({ column, max }: { column: AnyPgColumn; max: number }): SQL {
  return sql`char_length(${column}) <= ${sql.raw(String(max))}`;
}

/**
 * Drizzle table for `app.patient_prescriptions` — a doctor's prescription for a patient, a draft
 * until a prescriber approves it, then final (launch ROUTE #133, routes-final 7.C).
 *
 * @remarks
 * - **Notes:** `prescription_number` from the organization's counter
 *   (`trg_patient_prescriptions_prescription_number`); the lines stay `jsonb` (P16 — up to 30, read
 *   and printed with their prescription); the doctor and the approver are K8 composite keys
 *   `RESTRICT`, kept when they leave (K2); `chk_patient_prescriptions_approved` ties the status to
 *   its stamp and approver (P15). The patient `ON DELETE RESTRICT` (P7). RLS on the organization
 *   GUC with the retention-cleanup arm for the deleted-record purge.
 */
export const patient_prescriptions = appSchema
  .table(
    'patient_prescriptions',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // The "RX-500" of the prescription list — per organization, never reused
      prescription_number: integer('prescription_number').notNull().default(0),
      patient_id: bigint('patient_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => patients.id, { onDelete: 'restrict' }),
      appointment_id: bigint('appointment_id', { mode: 'number' }).references(
        (): AnyPgColumn => appointments.id,
        { onDelete: 'set null' },
      ),
      doctor_membership_id: bigint('doctor_membership_id', { mode: 'number' }).notNull(),
      prescription_date: date('prescription_date', { mode: 'string' }).notNull(),
      items: jsonb('items').notNull().default([]),
      advice: text('advice'),
      lab_report: text('lab_report'),
      procedure_today: text('procedure_today'),
      follow_up_date: date('follow_up_date', { mode: 'string' }),
      print_language: varchar('print_language', { length: 8 }).notNull().default('english'),
      status: varchar('status', { length: 8 }).notNull().default('draft'),
      approved_at: timestamp('approved_at', { withTimezone: true }),
      // Who approved it (P15)
      approved_by_membership_id: bigint('approved_by_membership_id', { mode: 'number' }),
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
      uniqueIndex('idx_patient_prescriptions_public_id').on(table.public_id),
      uniqueIndex('idx_patient_prescriptions_organization_prescription_number').on(
        table.organization_id,
        table.prescription_number,
      ),
      // The pharmacy queue (route 13)
      index('idx_patient_prescriptions_organization_status_date')
        .on(table.organization_id, table.status, table.prescription_date, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_patient_prescriptions_organization_created')
        .on(table.organization_id, table.created_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_patient_prescriptions_patient_created').on(
        table.patient_id,
        table.created_at,
        table.id,
      ),
      index('idx_patient_prescriptions_appointment_id')
        .on(table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      index('idx_patient_prescriptions_doctor_membership_id').on(
        table.organization_id,
        table.doctor_membership_id,
      ),
      index('idx_patient_prescriptions_approved_by_membership_id')
        .on(table.organization_id, table.approved_by_membership_id)
        .where(sql`${table.approved_by_membership_id} IS NOT NULL`),
      index('idx_patient_prescriptions_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_patient_prescriptions_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patient_prescriptions_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      // K8: members of this organization, kept when they leave (K2)
      foreignKey({
        name: 'patient_prescriptions_doctor_membership_fk',
        columns: [table.organization_id, table.doctor_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      foreignKey({
        name: 'patient_prescriptions_approved_by_membership_fk',
        columns: [table.organization_id, table.approved_by_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      check('chk_patient_prescriptions_prescription_number', sql`${table.prescription_number} > 0`),
      check(
        'chk_patient_prescriptions_items',
        sql`jsonb_typeof(${table.items}) = 'array' AND jsonb_array_length(${table.items}) <= ${sql.raw(String(PATIENT_PRESCRIPTION_ITEMS_MAX))}`,
      ),
      check(
        'chk_patient_prescriptions_advice',
        textAtMost({ column: table.advice, max: PATIENT_PRESCRIPTION_TEXT_MAX }),
      ),
      check(
        'chk_patient_prescriptions_lab_report',
        textAtMost({ column: table.lab_report, max: PATIENT_PRESCRIPTION_TEXT_MAX }),
      ),
      check(
        'chk_patient_prescriptions_procedure_today',
        textAtMost({ column: table.procedure_today, max: PATIENT_PRESCRIPTION_TEXT_MAX }),
      ),
      check(
        'chk_patient_prescriptions_print_language',
        sql`${table.print_language} IN (${sqlLiteralList(PATIENT_PRESCRIPTION_PRINT_LANGUAGE_VALUES)})`,
      ),
      check(
        'chk_patient_prescriptions_status',
        sql`${table.status} IN (${sqlLiteralList(PATIENT_PRESCRIPTION_STATUS_VALUES)})`,
      ),
      // P15: approved exactly when stamped with its time and approver
      check(
        'chk_patient_prescriptions_approved',
        sql`(${table.status} = '${sql.raw(PATIENT_PRESCRIPTION_STATUS.APPROVED)}') = (${table.approved_at} IS NOT NULL AND ${table.approved_by_membership_id} IS NOT NULL)`,
      ),
      check('chk_patient_prescriptions_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patient_prescriptions_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patient_prescriptions_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patient_prescriptions_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('patient_prescriptions_tenant_isolation', {
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
