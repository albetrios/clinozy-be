/** A visit as the API returns it (launch ROUTE #22). */
export interface VisitOutput {
  id: string;
  appointment_id: string;
  patient_id: string;
  stage: string;
  stage_changed_at: string;
  started_at: string;
  paused_at: string | null;
  completed_at: string | null;
  last_saved_at: string | null;
  consult_complaint: string | null;
  consult_findings: string | null;
  consult_plan: string | null;
  diagnoses: string[];
  is_safety_consent_checked: boolean;
  is_safety_before_photos_taken: boolean;
  is_safety_allergies_checked: boolean;
  created_at: string;
  updated_at: string;
}
