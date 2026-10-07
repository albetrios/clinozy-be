/** A payment as the API returns it (launch ROUTE #34). */
export interface PaymentOutput {
  id: string;
  /** The "PAY-5512" running number */
  payment_number: number;
  direction: string;
  kind: string;
  branch_id: string;
  amount: number;
  splits: unknown;
  patient_id: string | null;
  invoice_id: string | null;
  payee_name: string | null;
  expense_category: string | null;
  bill_ref: unknown | null;
  credit_note_id: string | null;
  pending_credit_id: string | null;
  note: string | null;
  paid_at: string;
  day_close_id: string | null;
  /** One payment may cover several supplier bills (P58) */
  bill_allocations: unknown;
  reference: string | null;
  attachment_keys: string[];
  is_checked_at_close: boolean;
  created_at: string;
  updated_at: string;
}
