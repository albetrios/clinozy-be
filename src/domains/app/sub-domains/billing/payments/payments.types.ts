import type { BilledContactOutput } from '@/domains/app/sub-domains/billing/invoices/invoices.types.js';
import type { PaymentSplit } from './payments.ledger.js';

/** What one change to a payment changed (routes-final 8.C.6 — B20). */
export interface PaymentEditOutput {
  id: string;
  /** `{ field: { from, to } }` — the changed fields only. */
  changes: unknown;
  author_membership_id: string | null;
  created_at: string;
}

/**
 * A payment as the API returns it (launch ROUTE #136, routes-final 8.C.6): one entry in or out.
 *
 * @remarks
 * - **Notes:** `splits` are the non-zero split columns (B18); `contact` and `patient_id` are the
 *   billed person (B3); `is_settled` — its day is closed (B6); `reversed_by_payment_id`, its live
 *   reversal (B21); `edit_count` / `last_edit`, its recorded changes (B20).
 */
export interface PaymentOutput {
  id: string;
  /** The "PAY-12" running number */
  payment_number: number;
  direction: string;
  kind: string;
  branch_id: string;
  amount: number;
  splits: PaymentSplit[];
  paid_at: string;
  contact: BilledContactOutput | null;
  patient_id: string | null;
  invoice_id: string | null;
  invoice_credit_note_id: string | null;
  pending_credit_id: string | null;
  reverses_payment_id: string | null;
  reversed_by_payment_id: string | null;
  payee_name: string | null;
  expense_category: string | null;
  reference: string | null;
  note: string | null;
  attachment_keys: string[];
  is_settled: boolean;
  edit_count: number;
  last_edit: PaymentEditOutput | null;
  created_at: string;
  updated_at: string;
}
