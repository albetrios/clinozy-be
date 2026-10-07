/** A stock movement as the API returns it (launch ROUTE #56). */
export interface StockMovementOutput {
  id: string;
  stock_item_id: string;
  type: string;
  /** Signed change ×1000, never 0 */
  delta_milli: number;
  used_for: string | null;
  patient_id: string | null;
  stock_purchase_id: string | null;
  stock_count_id: string | null;
  reverts_stock_movement_id: string | null;
  reverted_by_stock_movement_id: string | null;
  revert_reason: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}
