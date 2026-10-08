import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  pgPolicy,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { branch_machines } from '@/domains/app/sub-domains/branches/branch-machines/branch-machines.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patient_packages } from '@/domains/app/sub-domains/patient-packages/patient-packages.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { branch_rooms } from '@/domains/app/sub-domains/branches/branch-rooms/branch-rooms.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  APPOINTMENT_TYPE_VALUES,
  APPOINTMENT_STATUS_VALUES,
  APPOINTMENT_CANCEL_REASON_VALUES,
  APPOINTMENT_REMINDER_STATUS_VALUES,
} from '@/domains/app/sub-domains/appointments/appointments.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.appointments` — A booked slot for a patient or a lead with a doctor, in a branch — a room and a machine may be named (D28) (launch ROUTE #21, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `appointments_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const appointments = appSchema
  .table(
    'appointments',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // The "#2841" of the appointment list — per organization, never reused
      appointment_number: integer('appointment_number').notNull().default(0),
      patient_id: bigint('patient_id', { mode: 'number' }).references(
        (): AnyPgColumn => patients.id,
        { onDelete: 'no action' },
      ),
      lead_id: bigint('lead_id', { mode: 'number' }).references((): AnyPgColumn => leads.id, {
        onDelete: 'no action',
      }),
      branch_id: bigint('branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'no action' }),
      type: varchar('type', { length: 15 }).notNull().default('consultation'),
      offering_id: bigint('offering_id', { mode: 'number' }).references(
        (): AnyPgColumn => offerings.id,
        { onDelete: 'set null' },
      ),
      service_label: varchar('service_label', { length: 120 }).notNull(),
      doctor_membership_id: bigint('doctor_membership_id', { mode: 'number' })
        .notNull()
        .references(() => memberships.id, { onDelete: 'no action' }),
      therapist_membership_id: bigint('therapist_membership_id', { mode: 'number' }).references(
        () => memberships.id,
        { onDelete: 'set null' },
      ),
      branch_room_id: bigint('branch_room_id', { mode: 'number' }).references(
        (): AnyPgColumn => branch_rooms.id,
        {
          onDelete: 'set null',
        },
      ),
      branch_machine_id: bigint('branch_machine_id', { mode: 'number' }).references(
        (): AnyPgColumn => branch_machines.id,
        { onDelete: 'set null' },
      ),
      appointment_date: date('appointment_date', { mode: 'string' }).notNull(),
      start_time: time('start_time').notNull(),
      duration_minutes: integer('duration_minutes').notNull().default(30),
      status: varchar('status', { length: 10 }).notNull().default('scheduled'),
      cancel_reason: varchar('cancel_reason', { length: 20 }),
      cancel_note: varchar('cancel_note', { length: 280 }),
      // "Rescheduled · was …"
      rescheduled_from: timestamp('rescheduled_from', { withTimezone: true }),
      reason: varchar('reason', { length: 160 }),
      notes: text('notes'),
      follow_up_at: timestamp('follow_up_at', { withTimezone: true }),
      checked_in_at: timestamp('checked_in_at', { withTimezone: true }),
      completed_at: timestamp('completed_at', { withTimezone: true }),
      copied_from_appointment_id: bigint('copied_from_appointment_id', {
        mode: 'number',
      }).references((): AnyPgColumn => appointments.id, { onDelete: 'set null' }),
      reminder_status: varchar('reminder_status', { length: 17 }).notNull().default('not_sent'),
      is_confirmed_by_reply: boolean('is_confirmed_by_reply').notNull().default(false),
      move_count: integer('move_count').notNull().default(0),
      // A walk-in: booked at the current slot and checked in at once (appointments.6)
      is_walk_in: boolean('is_walk_in').notNull().default(false),
      patient_package_id: bigint('patient_package_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_packages.id,
        { onDelete: 'set null' },
      ),
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
      uniqueIndex('idx_appointments_public_id').on(table.public_id),
      index('idx_appointments_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_appointments_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_appointments_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_appointments_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_appointments_branch_date').on(
        table.branch_id,
        table.appointment_date,
        table.start_time,
      ),
      index('idx_appointments_doctor_date').on(
        table.doctor_membership_id,
        table.appointment_date,
        table.start_time,
      ),
      index('idx_appointments_branch_room_date')
        .on(table.branch_room_id, table.appointment_date)
        .where(sql`${table.branch_room_id} IS NOT NULL`),
      index('idx_appointments_branch_machine_date')
        .on(table.branch_machine_id, table.appointment_date)
        .where(sql`${table.branch_machine_id} IS NOT NULL`),
      index('idx_appointments_patient_date')
        .on(table.patient_id, table.appointment_date)
        .where(sql`${table.patient_id} IS NOT NULL`),
      index('idx_appointments_lead_id').on(table.lead_id).where(sql`${table.lead_id} IS NOT NULL`),
      index('idx_appointments_offering_id')
        .on(table.offering_id)
        .where(sql`${table.offering_id} IS NOT NULL`),
      index('idx_appointments_therapist_membership_id')
        .on(table.therapist_membership_id)
        .where(sql`${table.therapist_membership_id} IS NOT NULL`),
      index('idx_appointments_organization_appointment_date')
        .on(table.organization_id, table.appointment_date, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_appointments_copied_from_appointment_id')
        .on(table.copied_from_appointment_id)
        .where(sql`${table.copied_from_appointment_id} IS NOT NULL`),
      index('idx_appointments_patient_package_id')
        .on(table.patient_package_id)
        .where(sql`${table.patient_package_id} IS NOT NULL`),
      uniqueIndex('idx_appointments_organization_appointment_number').on(
        table.organization_id,
        table.appointment_number,
      ),
      check('chk_appointments_appointment_number', sql`${table.appointment_number} > 0`),
      check(
        'chk_appointments_type',
        sql`${table.type} IN (${joinValues(APPOINTMENT_TYPE_VALUES)})`,
      ),
      check('chk_appointments_duration_minutes', sql`${table.duration_minutes} BETWEEN 5 AND 240`),
      check(
        'chk_appointments_status',
        sql`${table.status} IN (${joinValues(APPOINTMENT_STATUS_VALUES)})`,
      ),
      check(
        'chk_appointments_cancel_reason',
        sql`${table.cancel_reason} IN (${joinValues(APPOINTMENT_CANCEL_REASON_VALUES)})`,
      ),
      check(
        'chk_appointments_reminder_status',
        sql`${table.reminder_status} IN (${joinValues(APPOINTMENT_REMINDER_STATUS_VALUES)})`,
      ),
      check('chk_appointments_move_count', sql`${table.move_count} >= 0`),
      check(
        'chk_appointments_patient_or_lead',
        sql`(${table.patient_id} IS NULL) <> (${table.lead_id} IS NULL)`,
      ),
      check('chk_appointments_duration_step', sql`${table.duration_minutes} % 5 = 0`),
      check(
        'chk_appointments_cancel_reason_when_cancelled',
        sql`(${table.status} = 'cancelled') = (${table.cancel_reason} IS NOT NULL)`,
      ),
      check('chk_appointments_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_appointments_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_appointments_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_appointments_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('appointments_tenant_isolation', {
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
