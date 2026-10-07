/** A credit note as the API returns it (launch ROUTE #36). */
export interface CreditNoteOutput {
  id: string;
  /** The "CN-001" running number */
  credit_note_number: number;
  invoice_id: string;
  amount: number;
  reason: string;
  created_at: string;
  updated_at: string;
}
