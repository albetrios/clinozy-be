import type { PatientPrescriptionLine } from './patient-prescriptions.dto.js';

/**
 * A patient prescription as the API returns it (launch ROUTE #133, routes-final 7.C.6): a draft
 * until a prescriber approves it, then final (P15).
 */
export interface PatientPrescriptionOutput {
  id: string;
  /** The "RX-500" of the prescription list — per organization, never reused */
  prescription_number: number;
  patient_id: string;
  appointment_id: string | null;
  doctor_membership_id: string;
  prescription_date: string;
  /** Up to 30 lines (P16) */
  items: PatientPrescriptionLine[];
  advice: string | null;
  lab_report: string | null;
  procedure_today: string | null;
  follow_up_date: string | null;
  print_language: string;
  status: string;
  approved_at: string | null;
  /** Who approved it (P15) */
  approved_by_membership_id: string | null;
  created_at: string;
  updated_at: string;
}
