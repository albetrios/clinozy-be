/**
 * A stock item movement as the API returns it (launch ROUTE #137, routes-final 9.B.6).
 *
 * @remarks
 * - **Notes:** `quantity_change` is signed by its type (S7), `quantity_after` the balance it left;
 *   `reverted_by_stock_item_movement_id` the revert that undid it (S8), derived.
 */
export interface StockItemMovementOutput {
  id: string;
  stock_item_id: string | null;
  type: string;
  quantity_change: number;
  quantity_after: number;
  used_for: string | null;
  note: string | null;
  patient_treatment_id: string | null;
  stock_purchase_id: string | null;
  stock_count_id: string | null;
  reverts_stock_item_movement_id: string | null;
  reverted_by_stock_item_movement_id: string | null;
  revert_reason: string | null;
  author_membership_id: string | null;
  created_at: string;
}
