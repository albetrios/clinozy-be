/** One line of a purchase (S10). */
export interface StockPurchaseItemOutput {
  line_number: number;
  stock_item_id: string;
  quantity: number;
  rate: number;
  amount: number;
}

/**
 * A stock purchase as the API returns it (launch ROUTE #137, routes-final 9.D.6).
 *
 * @remarks
 * - **Notes:** its lines are fixed once saved (S10); `paid_amount` is kept by the supplier-bill
 *   payments in `payment_ids`, `due_amount` and `payment_status` follow it (S11).
 */
export interface StockPurchaseOutput {
  id: string;
  /** The "#16" running number */
  stock_purchase_number: number;
  stock_vendor_id: string | null;
  bill_number: string | null;
  purchase_date: string;
  items: StockPurchaseItemOutput[];
  bill_amount: number;
  paid_amount: number;
  due_amount: number;
  payment_status: string;
  payment_ids: string[];
  created_at: string;
  updated_at: string;
}
