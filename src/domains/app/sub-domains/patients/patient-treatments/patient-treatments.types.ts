/** A session's latest check-in — the tab's Feedback column (7.H.6). */
export interface PatientTreatmentCheckInSummary {
  id: string;
  feel: string;
  score: number;
  check_in_date: string;
}

/**
 * A treatment as the API returns it (launch ROUTE #134, routes-final 7.H.6): one session, reversed
 * with a reason, never deleted (TR6).
 *
 * @remarks
 * - **Notes:** `patient_offering_id` is the bought session it spent (TR7, TR13); `is_billed` is
 *   derived — true with a link, false for a done session with an offering and none, null otherwise.
 */
export interface PatientTreatmentOutput {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  offering_id: string | null;
  name: string;
  template: string;
  performed_at: string;
  doctor_membership_id: string | null;
  therapist_membership_id: string | null;
  body_parts: string[];
  session_number: number;
  parameters: Record<string, string>;
  remark: string | null;
  aftercare_call: string;
  patient_offering_id: string | null;
  is_billed: boolean | null;
  status: string;
  reversed_reason: string | null;
  reversed_at: string | null;
  latest_check_in: PatientTreatmentCheckInSummary | null;
  created_at: string;
  updated_at: string;
}
