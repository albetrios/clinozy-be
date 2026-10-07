/** A treatment as the API returns it (launch ROUTE #40). */
export interface TreatmentOutput {
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
  /** Keys per template (type, skin type, machine, power, wavelength, BP, findings…) */
  parameters: unknown;
  remark: string | null;
  aftercare_call: string;
  patient_package_id: string | null;
  status: string;
  reversed_reason: string | null;
  reversed_at: string | null;
  created_at: string;
  updated_at: string;
}
