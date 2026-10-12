/** One counted item of a stock check (S9). */
export interface StockCountLineOutput {
  stock_item_id: string;
  /** The item's balance when the count was saved */
  system_quantity: number;
  counted_quantity: number;
  /** Counted less system — what the `adjust` movement moved */
  difference: number;
}

/**
 * A stock count as the API returns it (launch ROUTE #137, routes-final 9.C.6).
 *
 * @remarks
 * - **Notes:** never changed (S9); `changed_item_count` the lines that differed — each an
 *   `adjust` movement.
 */
export interface StockCountOutput {
  id: string;
  counted_at: string;
  author_membership_id: string | null;
  lines: StockCountLineOutput[];
  changed_item_count: number;
  created_at: string;
}
