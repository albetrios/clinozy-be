/** The billed person as a bill shows them (B3). */
export interface BilledContactOutput {
  id: string;
  name: string;
  primary_phone: string;
}

/**
 * One invoice line as the API returns it (launch ROUTE #136, routes-final 8.A.6).
 *
 * @remarks
 * - **Notes:** the snapshot rate and GST and the computed amounts (B9); `patient_offering_id` is
 *   the patient offering it sold (PK4), `patient_treatment_ids` the treatments it bills (B28).
 */
export interface InvoiceItemOutput {
  id: string;
  line_number: number;
  offering_id: string | null;
  medicine_id: string | null;
  name: string;
  pack_size: string | null;
  quantity: number;
  rate: number;
  discount_percent: number;
  discount_amount: number;
  gst_percent: number;
  is_gst_inclusive: boolean;
  taxable_amount: number;
  gst_amount: number;
  amount: number;
  patient_offering_suggestion_id: string | null;
  patient_offering_id: string | null;
  patient_treatment_ids: string[];
  batch_number: string | null;
}

/**
 * An invoice as the API returns it (launch ROUTE #136, routes-final 8.A.6) — the print preview.
 *
 * @remarks
 * - **Notes:** the amounts are the server's (B9); `paid_amount` moves with every payment,
 *   `due_amount` and `payment_status` are generated (B5); `is_settled` — a payment on a closed day
 *   (B12); `contact` and `patient_id` the billed person and their patient file (B3).
 */
export interface InvoiceOutput {
  id: string;
  invoice_sequence: number;
  invoice_number: string;
  financial_year: string;
  type: string;
  branch_id: string;
  contact: BilledContactOutput | null;
  patient_id: string | null;
  member_ids: string[];
  items: InvoiceItemOutput[];
  overall_discount: number;
  subtotal: number;
  discount_total: number;
  taxable_total: number;
  gst_total: number;
  total: number;
  paid_amount: number;
  due_amount: number;
  payment_status: string;
  is_settled: boolean;
  invoice_date: string;
  remark: string | null;
  patient_prescription_id: string | null;
  created_at: string;
  updated_at: string;
}
