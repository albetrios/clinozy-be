/** A machine as the API returns it (launch ROUTE #20). */
export interface MachineOutput {
  id: string;
  branch_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
