/** A clinical note as the API returns it (launch ROUTE #24). */
export interface PatientClinicalNoteOutput {
  id: string;
  patient_id: string;
  kind: string;
  text: string;
  added_at: string;
  created_at: string;
  updated_at: string;
}
