import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import {
  clockTimeOfMinutes,
  minutesOfClockTime,
  toHourMinute,
  toInstant,
} from '@/shared/utils/validation/record-fields.util.js';
import type { AppointmentOutput } from './appointments.types.js';

/**
 * Shapes an `app.appointments` row as the API returns it (routes-final 6.6): public ids, `HH:mm`
 * times with the computed `end_time`, ISO instants. The contact summary and the contact's patient
 * file and open lead are the rules' `decorate` (one read each per page) — empty here.
 */
export function serializeAppointment({
  row,
  references,
}: {
  row: BaseRecordRow;
  references: BaseRecordReferenceLookup;
}): AppointmentOutput {
  const startTime = toHourMinute(String(row.start_time));
  const durationMinutes = row.duration_minutes as number;
  return {
    id: row.public_id,
    appointment_number: row.appointment_number as number,
    contact_id: references.publicIdOf({ field: 'contact_id', row }) ?? '',
    contact: null,
    patient_id: null,
    lead_id: null,
    branch_id: references.publicIdOf({ field: 'branch_id', row }) ?? '',
    type: row.type as string,
    offering_id: references.publicIdOf({ field: 'offering_id', row }),
    service_label: row.service_label as string,
    doctor_membership_id: references.publicIdOf({ field: 'doctor_membership_id', row }) ?? '',
    therapist_membership_id: references.publicIdOf({ field: 'therapist_membership_id', row }),
    branch_room_id: references.publicIdOf({ field: 'branch_room_id', row }),
    branch_machine_id: references.publicIdOf({ field: 'branch_machine_id', row }),
    appointment_date: row.appointment_date as string,
    start_time: startTime,
    end_time: clockTimeOfMinutes(minutesOfClockTime(startTime) + durationMinutes),
    duration_minutes: durationMinutes,
    status: row.status as string,
    visit_stage: row.visit_stage as string | null,
    visit_stage_changed_at: toInstant(row.visit_stage_changed_at),
    visit_paused_at: toInstant(row.visit_paused_at),
    is_walk_in: row.is_walk_in as boolean,
    cancel_reason: row.cancel_reason as string | null,
    cancel_note: row.cancel_note as string | null,
    checked_in_at: toInstant(row.checked_in_at),
    completed_at: toInstant(row.completed_at),
    rescheduled_from: toInstant(row.rescheduled_from),
    move_count: row.move_count as number,
    reason: row.reason as string | null,
    notes: row.notes as string | null,
    follow_up_at: toInstant(row.follow_up_at),
    copied_from_appointment_id: references.publicIdOf({ field: 'copied_from_appointment_id', row }),
    reminder_status: row.reminder_status as string,
    is_confirmed_by_reply: row.is_confirmed_by_reply as boolean,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
