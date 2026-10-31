/** One order line as a page shows it (11.E.6) — `expiry_month` as `YYYY-MM`. */
export interface MedicalPurchaseOrderItemOutput {
  id: string;
  line_number: number;
  medicine_id: string;
  medicine_name: string;
  quantity: number;
  free_quantity: number;
  rate: number;
  /** The MRP printed on the line's packs — the batch it fills takes it. */
  mrp: number | null;
  /** Now `taxable_amount + gst_amount` — quantity × rate when the rate includes GST (PG4). */
  amount: number;
  /** The line's GST rate — 0, 5, 12, 18 or 28 (PG3). */
  gst_percent: number;
  /** Whether the rate includes GST. */
  is_gst_inclusive: boolean;
  taxable_amount: number;
  gst_amount: number;
  is_received: boolean | null;
  batch_number: string | null;
  expiry_month: string | null;
}

/**
 * A medical purchase order as the API returns it (launch ROUTE #153, routes-final 11.E.6).
 *
 * @remarks
 * - **Notes:** money in rupees; `due_amount` and `payment_status` follow total − paid − credited
 *   once received (MD15); the supplier's name, phone and GSTIN, the lines and their counts are the rules'
 *   `decorate`. A cancelled one carries its `delete_reason` and `delete_note`.
 */
export interface MedicalPurchaseOrderOutput {
  id: string;
  purchase_order_number: number;
  /** The supplier — with its phone and GSTIN, a deleted one's too (the PO print sheet, MD30 (c)). */
  supplier: { id: string; name: string; phone: string | null; gst_number: string | null };
  supplier_bill_number: string | null;
  /** What the desk noted ("30 DAYS DUE") — the one field a received order still changes. */
  note: string | null;
  order_date: string;
  stage: string;
  received_at: string | null;
  items: MedicalPurchaseOrderItemOutput[];
  item_count: number;
  free_count: number;
  /** `taxable_total + gst_total` — its lines', the received ones' once received (PG7). */
  total: number;
  taxable_total: number;
  gst_total: number;
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
