import type { PatientPrescriptionLine } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.dto.js';

/** A prescription kit as the API returns it (launch ROUTE #133, routes-final 7.D.6) — a doctor's own lines (P17). */
export interface PrescriptionKitOutput {
  id: string;
  owner_membership_id: string;
  name: string;
  /** Up to 30 lines, a prescription's (P16) */
  items: PatientPrescriptionLine[];
  created_at: string;
  updated_at: string;
}
