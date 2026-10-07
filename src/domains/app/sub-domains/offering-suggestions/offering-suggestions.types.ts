/** A offering suggestion as the API returns it (launch ROUTE #32). */
export interface OfferingSuggestionOutput {
  id: string;
  patient_id: string;
  offering_id: string;
  quantity: number;
  /** The line's final price; null = list price */
  price: number | null;
  status: string;
  source_label: string;
  appointment_id: string | null;
  reason: string | null;
  /** { invoice_id, invoice_line_index, quantity } — written when an invoice is linked */
  invoice_links: unknown;
  created_at: string;
  updated_at: string;
}
