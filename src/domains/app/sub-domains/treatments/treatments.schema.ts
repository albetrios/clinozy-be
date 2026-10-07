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
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patient_packages } from '@/domains/app/sub-domains/patient-packages/patient-packages.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  TREATMENT_TEMPLATE_VALUES,
  TREATMENT_BODY_PARTS_VALUES,
  TREATMENT_AFTERCARE_CALL_VALUES,
  TREATMENT_STATUS_VALUES,
} from '@/domains/app/sub-domains/treatments/treatments.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.treatments` — A treatment session done for a patient — reversed with a reason, never deleted (P89) (launch ROUTE #40, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `treatments_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const treatments = appSchema
  .table(
    'treatments',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      patient_id: bigint('patient_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => patients.id, { onDelete: 'no action' }),
      appointment_id: bigint('appointment_id', { mode: 'number' }).references(
        (): AnyPgColumn => appointments.id,
        { onDelete: 'set null' },
      ),
      offering_id: bigint('offering_id', { mode: 'number' }).references(
        (): AnyPgColumn => offerings.id,
        { onDelete: 'set null' },
      ),
      name: varchar('name', { length: 120 }).notNull(),
      template: varchar('template', { length: 7 }).notNull().default('skin'),
      performed_at: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
      doctor_membership_id: bigint('doctor_membership_id', { mode: 'number' }).references(
        () => memberships.id,
        { onDelete: 'set null' },
      ),
      therapist_membership_id: bigint('therapist_membership_id', { mode: 'number' }).references(
        () => memberships.id,
        { onDelete: 'set null' },
      ),
      body_parts: text('body_parts').array().notNull().default([]),
      session_number: integer('session_number').notNull().default(1),
      // Keys per template (type, skin type, machine, power, wavelength, BP, findings…)
      parameters: jsonb('parameters').notNull().default({}),
      remark: text('remark'),
      aftercare_call: varchar('aftercare_call', { length: 11 }).notNull().default('next_day'),
      // The package this session uses — one of its sessions is taken; a reverse gives it back
      patient_package_id: bigint('patient_package_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_packages.id,
        { onDelete: 'set null' },
      ),
      status: varchar('status', { length: 8 }).notNull().default('done'),
      reversed_reason: varchar('reversed_reason', { length: 280 }),
      reversed_at: timestamp('reversed_at', { withTimezone: true }),
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
      uniqueIndex('idx_treatments_public_id').on(table.public_id),
      index('idx_treatments_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_treatments_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_treatments_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_treatments_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_treatments_patient_created').on(table.patient_id, table.created_at, table.id),
      index('idx_treatments_appointment_id')
        .on(table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      index('idx_treatments_offering_id')
        .on(table.offering_id)
        .where(sql`${table.offering_id} IS NOT NULL`),
      index('idx_treatments_organization_performed_at')
        .on(table.organization_id, table.performed_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_treatments_doctor_membership_id')
        .on(table.doctor_membership_id)
        .where(sql`${table.doctor_membership_id} IS NOT NULL`),
      index('idx_treatments_therapist_membership_id')
        .on(table.therapist_membership_id)
        .where(sql`${table.therapist_membership_id} IS NOT NULL`),
      index('idx_treatments_patient_package_id')
        .on(table.patient_package_id)
        .where(sql`${table.patient_package_id} IS NOT NULL`),
      check(
        'chk_treatments_template',
        sql`${table.template} IN (${joinValues(TREATMENT_TEMPLATE_VALUES)})`,
      ),
      check(
        'chk_treatments_body_parts',
        sql`${table.body_parts} <@ ARRAY[${joinValues(TREATMENT_BODY_PARTS_VALUES)}]::text[]`,
      ),
      check('chk_treatments_session_number', sql`${table.session_number} BETWEEN 1 AND 99`),
      check(
        'chk_treatments_aftercare_call',
        sql`${table.aftercare_call} IN (${joinValues(TREATMENT_AFTERCARE_CALL_VALUES)})`,
      ),
      check(
        'chk_treatments_status',
        sql`${table.status} IN (${joinValues(TREATMENT_STATUS_VALUES)})`,
      ),
      check(
        'chk_treatments_reversed_reason_when_reversed',
        sql`(${table.status} = 'reversed') = (${table.reversed_reason} IS NOT NULL)`,
      ),
      check('chk_treatments_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_treatments_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_treatments_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_treatments_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('treatments_tenant_isolation', {
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
