/**
 * A credit note as the API returns it (launch ROUTE #136, routes-final 8.B.6): an invoice's refund
 * document.
 *
 * @remarks
 * - **Notes:** `payment_id` is its refund payment, written with it (B16); never edited.
 */
export interface InvoiceCreditNoteOutput {
  id: string;
  credit_note_number: number;
  invoice_id: string;
  amount: number;
  reason: string;
  payment_id: string | null;
  created_at: string;
  updated_at: string;
}
