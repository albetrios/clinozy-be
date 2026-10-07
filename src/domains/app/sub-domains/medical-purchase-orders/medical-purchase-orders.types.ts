/** A purchase order as the API returns it (launch ROUTE #49). */
export interface MedicalPurchaseOrderOutput {
  id: string;
  /** The "PO #431" running number */
  purchase_order_number: number;
  supplier_id: string;
  supplier_bill_number: string | null;
  order_date: string;
  stage: string;
  items: unknown;
  paid_amount: number;
  cancel_reason: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}
