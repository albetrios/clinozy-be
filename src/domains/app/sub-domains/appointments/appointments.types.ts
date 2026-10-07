/** A appointment as the API returns it (launch ROUTE #21). */
export interface AppointmentOutput {
  id: string;
  /** The "#2841" of the appointment list — per organization, never reused */
  appointment_number: number;
  patient_id: string | null;
  lead_id: string | null;
  branch_id: string;
  type: string;
  offering_id: string | null;
  service_label: string;
  doctor_membership_id: string;
  therapist_membership_id: string | null;
  room_id: string | null;
  machine_id: string | null;
  appointment_date: string;
  start_time: string;
  duration_minutes: number;
  status: string;
  cancel_reason: string | null;
  cancel_note: string | null;
  /** "Rescheduled · was …" */
  rescheduled_from: string | null;
  reason: string | null;
  notes: string | null;
  follow_up_at: string | null;
  checked_in_at: string | null;
  completed_at: string | null;
  copied_from_appointment_id: string | null;
  reminder_status: string;
  is_confirmed_by_reply: boolean;
  move_count: number;
  /** A walk-in: booked at the current slot and checked in at once (appointments.6) */
  is_walk_in: boolean;
  patient_package_id: string | null;
  created_at: string;
  updated_at: string;
}
