/** A prescription as the API returns it (launch ROUTE #25). */
export interface PrescriptionOutput {
  id: string;
  patient_id: string;
  /** The "#500" of the prescription list */
  prescription_number: number;
  appointment_id: string | null;
  doctor_membership_id: string;
  prescription_date: string;
  items: unknown;
  advice: string | null;
  lab_report: string | null;
  procedure_today: string | null;
  follow_up_date: string | null;
  status: string;
  approved_at: string | null;
  print_language: string;
  created_at: string;
  updated_at: string;
}
