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
  pgPolicy,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  PRESCRIPTION_STATUS_VALUES,
  PRESCRIPTION_PRINT_LANGUAGE_VALUES,
} from '@/domains/app/sub-domains/prescriptions/prescriptions.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.prescriptions` — A doctor's prescription for a patient — a draft until a prescriber approves it (D31) (launch ROUTE #25, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `prescriptions_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const prescriptions = appSchema
  .table(
    'prescriptions',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // The "#500" of the prescription list
      prescription_number: integer('prescription_number').notNull().default(0),
      patient_id: bigint('patient_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => patients.id, { onDelete: 'no action' }),
      appointment_id: bigint('appointment_id', { mode: 'number' }).references(
        (): AnyPgColumn => appointments.id,
        { onDelete: 'set null' },
      ),
      doctor_membership_id: bigint('doctor_membership_id', { mode: 'number' })
        .notNull()
        .references(() => memberships.id, { onDelete: 'no action' }),
      prescription_date: date('prescription_date', { mode: 'string' }).notNull(),
      items: jsonb('items').notNull().default([]),
      advice: text('advice'),
      lab_report: text('lab_report'),
      procedure_today: text('procedure_today'),
      follow_up_date: date('follow_up_date', { mode: 'string' }),
      status: varchar('status', { length: 8 }).notNull().default('draft'),
      approved_at: timestamp('approved_at', { withTimezone: true }),
      print_language: varchar('print_language', { length: 8 }).notNull().default('english'),
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
      uniqueIndex('idx_prescriptions_public_id').on(table.public_id),
      index('idx_prescriptions_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_prescriptions_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_prescriptions_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_prescriptions_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_prescriptions_patient_created').on(table.patient_id, table.created_at, table.id),
      index('idx_prescriptions_appointment_id')
        .on(table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      index('idx_prescriptions_doctor_membership_id').on(table.doctor_membership_id),
      index('idx_prescriptions_organization_prescription_date')
        .on(table.organization_id, table.prescription_date, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      uniqueIndex('idx_prescriptions_organization_prescription_number').on(
        table.organization_id,
        table.prescription_number,
      ),
      check('chk_prescriptions_prescription_number', sql`${table.prescription_number} > 0`),
      check(
        'chk_prescriptions_status',
        sql`${table.status} IN (${joinValues(PRESCRIPTION_STATUS_VALUES)})`,
      ),
      check(
        'chk_prescriptions_print_language',
        sql`${table.print_language} IN (${joinValues(PRESCRIPTION_PRINT_LANGUAGE_VALUES)})`,
      ),
      check('chk_prescriptions_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_prescriptions_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_prescriptions_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_prescriptions_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('prescriptions_tenant_isolation', {
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
