/** A stock purchase as the API returns it (launch ROUTE #55). */
export interface StockPurchaseOutput {
  id: string;
  /** The "#16" of the purchase list */
  stock_purchase_number: number;
  stock_vendor_id: string;
  bill_number: string | null;
  purchase_date: string;
  lines: unknown;
  bill_amount: number;
  paid_amount: number;
  created_at: string;
  updated_at: string;
}
