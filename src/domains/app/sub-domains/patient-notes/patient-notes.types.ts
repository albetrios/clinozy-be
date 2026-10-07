/** A patient note as the API returns it (launch ROUTE #29). */
export interface PatientNoteOutput {
  id: string;
  patient_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}
