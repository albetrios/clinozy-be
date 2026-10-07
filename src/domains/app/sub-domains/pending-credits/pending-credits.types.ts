/** A pending credit as the API returns it (launch ROUTE #37). */
export interface PendingCreditOutput {
  id: string;
  /** The "CR-2" running number */
  pending_credit_number: number;
  direction: string;
  party_kind: string;
  party_name: string;
  patient_id: string | null;
  amount: number;
  reason: string;
  source_payment_id: string | null;
  status: string;
  settled_payment_id: string | null;
  invoice_id: string | null;
  settle_by: string | null;
  settled_amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}
