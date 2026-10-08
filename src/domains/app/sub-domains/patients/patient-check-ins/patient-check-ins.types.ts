import type { PatientFeedbackActionOutput } from '@/domains/app/sub-domains/patients/patient-feedback-actions/patient-feedback-actions.types.js';

/**
 * A check-in as the API returns it (launch ROUTE #134, routes-final 7.I.6): how a patient is doing.
 *
 * @remarks
 * - **Notes:** `score_change` is against the patient's previous check-in (the ▲▼ trend, TR9);
 *   `next_offering_ids` are read back from the plan rows it created (TR10); `needs_action` = feel
 *   `worse` or a score ≤ 4 with no feedback action; `actions` newest first (TR12).
 */
export interface PatientCheckInOutput {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  patient_treatment_id: string | null;
  context: string;
  feel: string;
  score: number;
  score_change: number | null;
  followed: string | null;
  followed_note: string | null;
  current_state: string | null;
  next_plan: string | null;
  next_offering_ids: string[];
  check_in_date: string;
  needs_action: boolean;
  actions: PatientFeedbackActionOutput[];
  created_at: string;
  updated_at: string;
}
