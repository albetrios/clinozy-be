/**
 * A patient photo as the API returns it (launch ROUTE #133, routes-final 7.F.6): one of three
 * albums, optionally filed under its visit, its session and a stage (P23, P24).
 */
export interface PatientImageOutput {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  patient_treatment_id: string | null;
  album: string;
  stage: string | null;
  /** The confirmed upload's object key */
  file_key: string;
  /** The upload's file name (P25) */
  file_name: string;
  display_name: string | null;
  caption: string | null;
  body_part: string | null;
  taken_on: string;
  /** Its visit's service (the date groups — P26), or null */
  service_label: string | null;
  created_at: string;
  updated_at: string;
}
