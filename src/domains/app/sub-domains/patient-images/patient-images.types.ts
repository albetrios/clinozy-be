/** A patient image as the API returns it (launch ROUTE #27). */
export interface PatientImageOutput {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  album: string;
  /** The confirmed upload's object key */
  file_key: string;
  file_name: string;
  body_part: string | null;
  taken_on: string;
  caption: string | null;
  /** An editable display name (P45) */
  display_name: string | null;
  created_at: string;
  updated_at: string;
}
