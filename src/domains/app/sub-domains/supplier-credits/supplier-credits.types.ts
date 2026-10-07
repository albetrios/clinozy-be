/** A supplier credit as the API returns it (launch ROUTE #52). */
export interface SupplierCreditOutput {
  id: string;
  supplier_id: string;
  medicine_id: string | null;
  batch_number: string | null;
  quantity: number;
  amount: number;
  adjusted_at: string | null;
  created_at: string;
  updated_at: string;
}
