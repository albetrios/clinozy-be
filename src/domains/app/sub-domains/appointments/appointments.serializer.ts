import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { toHourMinute, toInstant } from '@/shared/utils/validation/record-fields.util.js';
import type { AppointmentOutput } from './appointments.types.js';

/** Shapes a `app.appointments` row as the API returns it (public ids, numbers, ISO times). */
export function serializeAppointment(
  row: BaseRecordRow,
  references: BaseRecordReferenceLookup,
): AppointmentOutput {
  return {
    id: row.public_id,
    appointment_number: row.appointment_number as number,
    patient_id: references.publicIdOf('patient_id', row),
    lead_id: references.publicIdOf('lead_id', row),
    branch_id: references.publicIdOf('branch_id', row) ?? '',
    type: row.type as string,
    offering_id: references.publicIdOf('offering_id', row),
    service_label: row.service_label as string,
    doctor_membership_id: references.publicIdOf('doctor_membership_id', row) ?? '',
    therapist_membership_id: references.publicIdOf('therapist_membership_id', row),
    room_id: references.publicIdOf('room_id', row),
    machine_id: references.publicIdOf('machine_id', row),
    appointment_date: row.appointment_date as string,
    start_time: toHourMinute(String(row.start_time)),
    duration_minutes: row.duration_minutes as number,
    status: row.status as string,
    cancel_reason: row.cancel_reason as string | null,
    cancel_note: row.cancel_note as string | null,
    rescheduled_from: toInstant(row.rescheduled_from),
    reason: row.reason as string | null,
    notes: row.notes as string | null,
    follow_up_at: toInstant(row.follow_up_at),
    checked_in_at: toInstant(row.checked_in_at),
    completed_at: toInstant(row.completed_at),
    copied_from_appointment_id: references.publicIdOf('copied_from_appointment_id', row),
    reminder_status: row.reminder_status as string,
    is_confirmed_by_reply: row.is_confirmed_by_reply as boolean,
    move_count: row.move_count as number,
    patient_package_id: references.publicIdOf('patient_package_id', row),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
