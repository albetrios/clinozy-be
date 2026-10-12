/**
 * A supplier credit as the API returns it (launch ROUTE #153, routes-final 11.C.6).
 *
 * @remarks
 * - **Notes:** money in rupees; `status` is `open` until `applied_amount` reaches `amount` (MD11);
 *   the names are the rules' `decorate`.
 */
export interface SupplierCreditOutput {
  id: string;
  supplier_id: string;
  supplier_name: string;
  medicine_id: string;
  medicine_name: string;
  medicine_batch_id: string;
  batch_number: string;
  quantity: number;
  rate: number;
  amount: number;
  applied_amount: number;
  status: string;
  created_by_membership_id: string | null;
  created_at: string;
}
