/** A medical sale as the API returns it (launch ROUTE #51). */
export interface MedicalSaleOutput {
  id: string;
  /** The "S-983" running number */
  sale_number: number;
  invoice_id: string | null;
  patient_id: string | null;
  medical_contact_id: string | null;
  prescription_id: string | null;
  lead_id: string | null;
  status: string;
  sold_at: string;
  voided_at: string | null;
  returns: unknown;
  created_at: string;
  updated_at: string;
}
