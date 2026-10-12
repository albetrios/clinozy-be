import type { PatientFeedbackActionOutput } from '@/domains/app/sub-domains/patients/patient-feedback-actions/patient-feedback-actions.types.js';

/**
 * A review as the API returns it (launch ROUTE #134, routes-final 7.J.6): what a patient said, and
 * where.
 *
 * @remarks
 * - **Notes:** `needs_action` = a rating ≤ 3 with no feedback action (TR11); `actions` newest first
 *   (TR12).
 */
export interface PatientReviewOutput {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  source: string;
  rating: number | null;
  text: string | null;
  link: string | null;
  /** Video or screenshot uploads */
  file_keys: string[];
  review_date: string;
  needs_action: boolean;
  actions: PatientFeedbackActionOutput[];
  created_at: string;
  updated_at: string;
}
