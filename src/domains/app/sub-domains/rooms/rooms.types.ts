/** A room as the API returns it (launch ROUTE #19). */
export interface RoomOutput {
  id: string;
  branch_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
