import type { BilledContactOutput } from '@/domains/app/sub-domains/billing/invoices/invoices.types.js';
import type { PaymentSplit } from './payments.ledger.js';
import type {
  PaymentInvoiceLink,
  PaymentMedicalPurchaseOrderLink,
  PaymentStockPurchaseLink,
} from './payments.repository.js';

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
 *   reversal (B21); `edit_count` / `last_edit`, its recorded changes (B20);
 *   `created_by_membership_id` who recorded it, and `invoice`, `invoice_credit_note_number`,
 *   `pending_credit_number`, `stock_purchase`, `medical_purchase_order` the numbers of what it
 *   points at (D81, the ledger's "By" and sub-line).
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
  /** The invoice's numbers, type and what is still due on it (D81) */
  invoice: PaymentInvoiceLink | null;
  invoice_credit_note_id: string | null;
  /** The credit note's "CN-3" number */
  invoice_credit_note_number: number | null;
  pending_credit_id: string | null;
  /** The pending credit's "CR-2" number */
  pending_credit_number: number | null;
  /** The stock purchase a supplier bill pays (launch #137, S11) */
  stock_purchase_id: string | null;
  /** The stock purchase's number and the vendor's bill number */
  stock_purchase: PaymentStockPurchaseLink | null;
  /** The received medical order a supplier bill pays (#153, MD7) */
  medical_purchase_order_id: string | null;
  /** The medical order's number and the supplier's bill number */
  medical_purchase_order: PaymentMedicalPurchaseOrderLink | null;
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
  /** Who recorded it — their membership (the "By" column, D81); null for an API key */
  created_by_membership_id: string | null;
  created_at: string;
  updated_at: string;
}
