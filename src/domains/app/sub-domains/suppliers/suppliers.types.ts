/** A supplier as the API returns it (launch ROUTE #45). */
export interface SupplierOutput {
  id: string;
  name: string;
  phone: string | null;
  gst_number: string | null;
  manufacturer_ids: string[];
  is_quick: boolean;
  created_at: string;
  updated_at: string;
}
