import { type BuildExtraConfigColumns, sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  pgPolicy,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { branch_machines } from '@/domains/app/sub-domains/branches/branch-machines/branch-machines.schema.js';
import { branch_rooms } from '@/domains/app/sub-domains/branches/branch-rooms/branch-rooms.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  APPOINTMENT_CANCEL_REASON_VALUES,
  APPOINTMENT_DURATION_MAX,
  APPOINTMENT_DURATION_MIN,
  APPOINTMENT_DURATION_STEP,
  APPOINTMENT_NOTES_MAX,
  APPOINTMENT_REMINDER_STATUS_VALUES,
  APPOINTMENT_STATUS_VALUES,
  APPOINTMENT_TYPE_VALUES,
  APPOINTMENT_VISIT_STAGE_VALUES,
} from '@/domains/app/sub-domains/appointments/appointments.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/** A PostgreSQL `tsrange` — the booking's local time span (A3); read as its text form. */
const tsrange = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsrange',
});

/** The columns of `app.appointments` (routes-final 6.3). */
const appointmentColumns = {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  public_id: varchar('public_id', { length: 28 }).notNull(),
  organization_id: bigint('organization_id', { mode: 'number' })
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  // The "#2841" of the appointment list — per organization, never reused
  appointment_number: integer('appointment_number').notNull().default(0),
  // Who is booked — a lead, a patient or neither (A1)
  contact_id: bigint('contact_id', { mode: 'number' })
    .notNull()
    .references(() => contacts.id, { onDelete: 'restrict' }),
  branch_id: bigint('branch_id', { mode: 'number' })
    .notNull()
    .references(() => branches.id, { onDelete: 'restrict' }),
  type: varchar('type', { length: 15 }).notNull().default('consultation'),
  offering_id: bigint('offering_id', { mode: 'number' }).references(
    (): AnyPgColumn => offerings.id,
    { onDelete: 'set null' },
  ),
  service_label: varchar('service_label', { length: 120 }).notNull(),
  doctor_membership_id: bigint('doctor_membership_id', { mode: 'number' }).notNull(),
  therapist_membership_id: bigint('therapist_membership_id', { mode: 'number' }),
  branch_room_id: bigint('branch_room_id', { mode: 'number' }).references(
    (): AnyPgColumn => branch_rooms.id,
    { onDelete: 'set null' },
  ),
  branch_machine_id: bigint('branch_machine_id', { mode: 'number' }).references(
    (): AnyPgColumn => branch_machines.id,
    { onDelete: 'set null' },
  ),
  // Local date and time (the organization's time zone)
  appointment_date: date('appointment_date', { mode: 'string' }).notNull(),
  start_time: time('start_time').notNull(),
  duration_minutes: smallint('duration_minutes').notNull().default(30),
  // date + start … + duration, the span the exclusion constraints compare (A3)
  time_range: tsrange('time_range').generatedAlwaysAs(
    sql`tsrange("appointment_date" + "start_time", "appointment_date" + "start_time" + "duration_minutes" * interval '1 minute', '[)')`,
  ),
  status: varchar('status', { length: 10 }).notNull().default('scheduled'),
  // A walk-in: placed at now and checked in at once, exempt from the slot rules (A6)
  is_walk_in: boolean('is_walk_in').notNull().default(false),
  cancel_reason: varchar('cancel_reason', { length: 20 }),
  cancel_note: varchar('cancel_note', { length: 280 }),
  // The visit's start and end (A10)
  checked_in_at: timestamp('checked_in_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  // The floor stage while checked in (A10, A11)
  visit_stage: varchar('visit_stage', { length: 11 }),
  visit_stage_changed_at: timestamp('visit_stage_changed_at', { withTimezone: true }),
  visit_paused_at: timestamp('visit_paused_at', { withTimezone: true }),
  // "Rescheduled · was …"
  rescheduled_from: timestamp('rescheduled_from', { withTimezone: true }),
  move_count: smallint('move_count').notNull().default(0),
  reason: varchar('reason', { length: 160 }),
  notes: text('notes'),
  follow_up_at: timestamp('follow_up_at', { withTimezone: true }),
  copied_from_appointment_id: bigint('copied_from_appointment_id', { mode: 'number' }).references(
    (): AnyPgColumn => appointments.id,
    { onDelete: 'set null' },
  ),
  // Written by the messaging worker (A13, M8)
  reminder_status: varchar('reminder_status', { length: 17 }).notNull().default('not_sent'),
  is_confirmed_by_reply: boolean('is_confirmed_by_reply').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(() => users.id),
  updated_by_user_id: bigint('updated_by_user_id', { mode: 'number' }).references(() => users.id),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
  delete_reason: varchar('delete_reason', { length: 20 }),
  delete_note: varchar('delete_note', { length: 280 }),
};

/** The table's columns as its extra config sees them. */
type AppointmentTable = BuildExtraConfigColumns<'appointments', typeof appointmentColumns, 'pg'>;

/** The indexes of 6.3 — the day view, the branch day, the doctor, a person's visits, the floor. */
function appointmentIndexes(table: AppointmentTable) {
  const live = sql`${table.deleted_at} IS NULL`;
  return [
    uniqueIndex('idx_appointments_public_id').on(table.public_id),
    uniqueIndex('idx_appointments_organization_appointment_number').on(
      table.organization_id,
      table.appointment_number,
    ),
    index('idx_appointments_organization_day')
      .on(table.organization_id, table.appointment_date, table.start_time, table.id)
      .where(live),
    index('idx_appointments_organization_created')
      .on(table.organization_id, table.created_at.desc(), table.id)
      .where(live),
    index('idx_appointments_branch_day').on(
      table.branch_id,
      table.appointment_date,
      table.start_time,
    ),
    index('idx_appointments_doctor_date')
      .on(table.doctor_membership_id, table.appointment_date)
      .where(live),
    index('idx_appointments_contact_date')
      .on(table.contact_id, table.appointment_date.desc())
      .where(live),
    index('idx_appointments_floor')
      .on(table.organization_id, table.branch_id, table.visit_stage)
      .where(sql`${table.deleted_at} IS NULL AND ${table.status} = 'checked_in'`),
    index('idx_appointments_contact_id').on(table.contact_id),
    index('idx_appointments_therapist_membership_id')
      .on(table.organization_id, table.therapist_membership_id)
      .where(sql`${table.therapist_membership_id} IS NOT NULL`),
    index('idx_appointments_branch_room_id')
      .on(table.branch_room_id)
      .where(sql`${table.branch_room_id} IS NOT NULL`),
    index('idx_appointments_branch_machine_id')
      .on(table.branch_machine_id)
      .where(sql`${table.branch_machine_id} IS NOT NULL`),
    index('idx_appointments_offering_id')
      .on(table.offering_id)
      .where(sql`${table.offering_id} IS NOT NULL`),
    index('idx_appointments_copied_from_appointment_id')
      .on(table.copied_from_appointment_id)
      .where(sql`${table.copied_from_appointment_id} IS NOT NULL`),
    index('idx_appointments_deleted_at')
      .on(table.deleted_at)
      .where(sql`${table.deleted_at} IS NOT NULL`),
    index('idx_appointments_created_by_user_id')
      .on(table.created_by_user_id)
      .where(sql`${table.created_by_user_id} IS NOT NULL`),
    index('idx_appointments_updated_by_user_id')
      .on(table.updated_by_user_id)
      .where(sql`${table.updated_by_user_id} IS NOT NULL`),
  ];
}

/** The CHECKs of 6.3 — values, the status stamps (A5) and the floor stage only while checked in (A10). */
function appointmentChecks(table: AppointmentTable) {
  return [
    check('chk_appointments_appointment_number', sql`${table.appointment_number} > 0`),
    check('chk_appointments_type', sql`${table.type} IN (${joinValues(APPOINTMENT_TYPE_VALUES)})`),
    check(
      'chk_appointments_service_label',
      sql`char_length(${table.service_label}) BETWEEN 1 AND 120`,
    ),
    check(
      'chk_appointments_duration_minutes',
      sql`${table.duration_minutes} BETWEEN ${sql.raw(String(APPOINTMENT_DURATION_MIN))} AND ${sql.raw(String(APPOINTMENT_DURATION_MAX))} AND ${table.duration_minutes} % ${sql.raw(String(APPOINTMENT_DURATION_STEP))} = 0`,
    ),
    check(
      'chk_appointments_status',
      sql`${table.status} IN (${joinValues(APPOINTMENT_STATUS_VALUES)})`,
    ),
    check(
      'chk_appointments_cancel_reason',
      sql`${table.cancel_reason} IN (${joinValues(APPOINTMENT_CANCEL_REASON_VALUES)})`,
    ),
    check(
      'chk_appointments_cancel_reason_when_cancelled',
      sql`(${table.status} = 'cancelled') = (${table.cancel_reason} IS NOT NULL)`,
    ),
    check(
      'chk_appointments_cancel_note_when_cancelled',
      sql`${table.status} = 'cancelled' OR ${table.cancel_note} IS NULL`,
    ),
    check(
      'chk_appointments_checked_in_at',
      sql`(${table.status} IN ('checked_in', 'completed')) = (${table.checked_in_at} IS NOT NULL)`,
    ),
    check(
      'chk_appointments_completed_at',
      sql`(${table.status} = 'completed') = (${table.completed_at} IS NOT NULL)`,
    ),
    check(
      'chk_appointments_visit_stage',
      sql`${table.visit_stage} IN (${joinValues(APPOINTMENT_VISIT_STAGE_VALUES)})`,
    ),
    check(
      'chk_appointments_visit_stage_when_checked_in',
      sql`(${table.status} = 'checked_in') = (${table.visit_stage} IS NOT NULL)`,
    ),
    check(
      'chk_appointments_visit_stage_changed_at',
      sql`(${table.visit_stage} IS NULL) = (${table.visit_stage_changed_at} IS NULL)`,
    ),
    check(
      'chk_appointments_visit_paused_at',
      sql`${table.visit_paused_at} IS NULL OR ${table.status} = 'checked_in'`,
    ),
    check('chk_appointments_move_count', sql`${table.move_count} >= 0`),
    check(
      'chk_appointments_notes',
      sql`char_length(${table.notes}) <= ${sql.raw(String(APPOINTMENT_NOTES_MAX))}`,
    ),
    check(
      'chk_appointments_reminder_status',
      sql`${table.reminder_status} IN (${joinValues(APPOINTMENT_REMINDER_STATUS_VALUES)})`,
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
  ];
}

/**
 * Drizzle table for `app.appointments` — one booking of a contact with a doctor, at a branch, in a
 * room or on a machine — and, once they arrive, its floor stage (launch ROUTE #132, routes-final 6;
 * the visit merged in, A10).
 *
 * @remarks
 * - **Notes:** the contact is `ON DELETE RESTRICT` (A1); the doctor and therapist are composite keys
 *   into the organization's memberships, kept when they leave (K2, K8). No double booking is the
 *   database's (A3): three `EXCLUDE USING gist` constraints over the generated `time_range` —
 *   `excl_appointments_doctor_time`, `excl_appointments_room_time`, `excl_appointments_machine_time`,
 *   on live slot-holding bookings, walk-ins exempt — live in the baseline migration only (Drizzle
 *   has no exclusion constraints). `appointment_number` from the organization's counter
 *   (`trg_appointments_appointment_number`). RLS is the organization policy with the
 *   retention-cleanup arm for the deleted-record purge; branch visibility is the service's (D9).
 */
export const appointments = appSchema
  .table('appointments', appointmentColumns, (table) => [
    index('idx_appointments_organization_doctor').on(
      table.organization_id,
      table.doctor_membership_id,
    ),
    ...appointmentIndexes(table),
    // K8: members of this organization, kept when they leave (K2)
    foreignKey({
      name: 'appointments_doctor_membership_fk',
      columns: [table.organization_id, table.doctor_membership_id],
      foreignColumns: [memberships.organization_id, memberships.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'appointments_therapist_membership_fk',
      columns: [table.organization_id, table.therapist_membership_id],
      foreignColumns: [memberships.organization_id, memberships.id],
    }).onDelete('restrict'),
    ...appointmentChecks(table),
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
  ])
  .enableRLS();
