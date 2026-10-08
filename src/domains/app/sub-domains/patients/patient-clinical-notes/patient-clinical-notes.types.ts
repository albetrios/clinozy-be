/** A clinical note as the API returns it (launch ROUTE #133, routes-final 7.B.6). */
export interface PatientClinicalNoteOutput {
  id: string;
  patient_id: string;
  kind: string;
  text: string;
  /** The visit it was taken at (A10) */
  appointment_id: string | null;
  /** A `diagnosis` note's catalogue entry (P12) */
  patient_diagnosis_id: string | null;
  added_at: string;
  created_at: string;
  updated_at: string;
}
