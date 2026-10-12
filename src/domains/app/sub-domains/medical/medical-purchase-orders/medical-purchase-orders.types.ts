/** One order line as a page shows it (11.E.6) — `expiry_month` as `YYYY-MM`. */
export interface MedicalPurchaseOrderItemOutput {
  id: string;
  line_number: number;
  medicine_id: string;
  medicine_name: string;
  quantity: number;
  free_quantity: number;
  rate: number;
  amount: number;
  is_received: boolean | null;
  batch_number: string | null;
  expiry_month: string | null;
}

/**
 * A medical purchase order as the API returns it (launch ROUTE #153, routes-final 11.E.6).
 *
 * @remarks
 * - **Notes:** money in rupees; `due_amount` and `payment_status` follow total − paid − credited
 *   once received (MD15); the supplier's name, the lines and their counts are the rules'
 *   `decorate`. A cancelled one carries its `delete_reason` and `delete_note`.
 */
export interface MedicalPurchaseOrderOutput {
  id: string;
  purchase_order_number: number;
  supplier: { id: string; name: string };
  supplier_bill_number: string | null;
  order_date: string;
  stage: string;
  received_at: string | null;
  items: MedicalPurchaseOrderItemOutput[];
  item_count: number;
  free_count: number;
  total: number;
  paid_amount: number;
  credited_amount: number;
  due_amount: number;
  payment_status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  delete_reason: string | null;
  delete_note: string | null;
}
