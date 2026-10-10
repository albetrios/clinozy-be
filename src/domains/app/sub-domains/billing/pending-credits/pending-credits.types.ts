import type { BilledContactOutput } from '@/domains/app/sub-domains/billing/invoices/invoices.types.js';

/**
 * A pending credit as the API returns it (launch ROUTE #136, routes-final 8.D.6): money owed to or
 * by someone.
 *
 * @remarks
 * - **Notes:** a contact (`contact` summary and `patient_id`) or a typed `party_name` (B23);
 *   `settled_amount` its settlements' total and `left_amount` what is left; `payment_ids` the
 *   settlements (B24); `created_by_membership_id` who recorded it (D81).
 */
export interface PendingCreditOutput {
  id: string;
  /** The "CR-2" running number */
  pending_credit_number: number;
  direction: string;
  contact: BilledContactOutput | null;
  patient_id: string | null;
  party_name: string | null;
  amount: number;
  settled_amount: number;
  left_amount: number;
  status: string;
  reason: string;
  note: string | null;
  invoice_id: string | null;
  source_payment_id: string | null;
  settle_by: string | null;
  payment_ids: string[];
  /** Who recorded it — their membership (the "By" column, D81); null for an API key */
  created_by_membership_id: string | null;
  created_at: string;
  updated_at: string;
}
