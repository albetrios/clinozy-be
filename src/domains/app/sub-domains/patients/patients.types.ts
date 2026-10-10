/**
 * A patient file as the API returns it (launch ROUTE #133, routes-final 7.A.6): the clinical side
 * of a contact.
 *
 * @remarks
 * - **Notes:** the person lives on the contact — only `contact_id` here, no embedded contact (P3; a
 *   list reads names with `GET /contacts?ids=…`); `conversion` = took a treatment (P4); `lead_id`
 *   is the lead the check-in that opened the file came from (P10), read-only; the medical details
 *   (`allergies`, `contraindications`, `notes`) are null to a caller without
 *   `patient:clinical_record:read`, `patient:update` or `patient_prescription:read` (launch D83 (3)).
 */
export interface PatientOutput {
  id: string;
  /** The "PT-0412" of the patient list — per organization, never reused */
  patient_number: number;
  contact_id: string;
  home_branch_id: string;
  types: string[];
  status: string;
  conversion: string;
  /** The usual doctor */
  doctor_membership_id: string | null;
  follow_up_at: string | null;
  /** A medical detail — null to a caller who may not see them (launch D83 (3)) */
  notes: string | null;
  lead_id: string | null;
  has_data_consent: boolean;
  has_photo_consent: boolean;
  /** A medical detail — null to a caller who may not see them (launch D83 (3)) */
  allergies: string[] | null;
  /** A medical detail — null to a caller who may not see them (launch D83 (3)) */
  contraindications: string[] | null;
  created_at: string;
  updated_at: string;
}

/** One row of the patients export (7.A.6): the file, with its contact's name and primary number. */
export interface PatientExportRow extends PatientOutput {
  contact_name: string | null;
  contact_primary_phone: string | null;
}
