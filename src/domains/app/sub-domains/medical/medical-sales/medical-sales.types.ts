import type { BilledContactOutput } from '@/domains/app/sub-domains/billing/invoices/invoices.types.js';

/**
 * One sold line (11.H.6) — a batch a medicine was drawn from; `expiry_month` as `YYYY-MM`;
 * `quantity` and `rate` per unit (a pack while `units_per_pack` is 1), with the pack label and HSN
 * code snapshotted when billed.
 */
export interface MedicalSaleItemOutput {
  invoice_item_id: string;
  medicine_id: string | null;
  name: string;
  /** The line's free text, typed on the bill (feat-bill-line-description). */
  description: string | null;
  pack_size: string | null;
  hsn_code: string | null;
  units_per_pack: number;
  batch_number: string | null;
  expiry_month: string | null;
  quantity: number;
  rate: number;
  discount_percent: number;
  amount: number;
  returned_quantity: number;
}

/** A return from the patient (11.H.6). */
export interface MedicalSaleReturnOutput {
  id: string;
  reason: string;
  refund_mode: string;
  note: string | null;
  amount: number;
  invoice_credit_note_id: string;
  /** A store-credit return's `give` pending credit (MD33) — null otherwise. */
  pending_credit_id: string | null;
  items: { invoice_item_id: string; quantity: number; amount: number; is_restocked: boolean }[];
  returned_by_membership_id: string | null;
  created_at: string;
}

/**
 * A medical sale as the API returns it (launch ROUTE #153, routes-final 11.H.6).
 *
 * @remarks
 * - **Notes:** money in rupees; `status` is `voided` (deleted), `returned` (any return), `paid` or
 *   `unpaid` (its invoice's due, MD21); the margin is the lines' amounts less their batches'
 *   purchase cost. Everything but the row's own columns is the rules' `decorate`.
 */
export interface MedicalSaleOutput {
  id: string;
  sale_number: number;
  status: string;
  contact: BilledContactOutput | null;
  patient_id: string | null;
  branch_id: string;
  invoice: {
    id: string;
    invoice_number: string;
    total: number;
    paid_amount: number;
    due_amount: number;
    payment_status: string;
  } | null;
  items: MedicalSaleItemOutput[];
  returned_amount: number;
  margin_amount: number;
  margin_percent: number | null;
  member_ids: string[];
  patient_prescription_id: string | null;
  remark: string | null;
  returns: MedicalSaleReturnOutput[];
  sold_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  delete_reason: string | null;
  delete_note: string | null;
}
