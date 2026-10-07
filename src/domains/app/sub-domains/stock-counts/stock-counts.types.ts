/** A stock count as the API returns it (launch ROUTE #57). */
export interface StockCountOutput {
  id: string;
  lines: unknown;
  counted_at: string;
  created_at: string;
  updated_at: string;
}
