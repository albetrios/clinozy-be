/** The summary of its contact every appointment carries, for lists (A1). */
export interface AppointmentContactOutput {
  id: string;
  contact_number: number;
  first_name: string;
  last_name: string | null;
  primary_phone: string;
}

/**
 * An appointment as the API returns it (launch ROUTE #132, routes-final 6.6): one booking of a
 * contact and, once checked in, its floor stage (the visit merged in, A10).
 *
 * @remarks
 * - **Notes:** `contact` is the list summary of the contact; `patient_id` and `lead_id` are the
 *   contact's patient file and open lead (A1), read-only. `end_time` is start + duration.
 *   `visit_stage` and its times exist only while `checked_in`; `checked_in_at` / `completed_at`
 *   are the visit's start and end. `reminder_status` and `is_confirmed_by_reply` are the messaging
 *   worker's (A13).
 */
export interface AppointmentOutput {
  id: string;
  /** The "#2841" of the appointment list — per organization, never reused */
  appointment_number: number;
  contact_id: string;
  contact: AppointmentContactOutput | null;
  patient_id: string | null;
  lead_id: string | null;
  branch_id: string;
  type: string;
  offering_id: string | null;
  service_label: string;
  doctor_membership_id: string;
  therapist_membership_id: string | null;
  branch_room_id: string | null;
  branch_machine_id: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: string;
  visit_stage: string | null;
  visit_stage_changed_at: string | null;
  visit_paused_at: string | null;
  is_walk_in: boolean;
  cancel_reason: string | null;
  cancel_note: string | null;
  checked_in_at: string | null;
  completed_at: string | null;
  /** "Rescheduled · was …" */
  rescheduled_from: string | null;
  move_count: number;
  reason: string | null;
  notes: string | null;
  follow_up_at: string | null;
  copied_from_appointment_id: string | null;
  reminder_status: string;
  is_confirmed_by_reply: boolean;
  created_at: string;
  updated_at: string;
}

/** An appointment as a contact's preview shows its last or next one (4.A.6). */
export interface AppointmentSummaryOutput {
  id: string;
  appointment_date: string;
  start_time: string;
  service_label: string;
  status: string;
}
