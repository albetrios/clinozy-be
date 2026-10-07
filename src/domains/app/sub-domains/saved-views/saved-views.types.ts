/** A saved view as the API returns it (launch ROUTE #9). */
export interface SavedViewOutput {
  id: string;
  /** Which list the view belongs to (patients, payments, …) */
  list_key: string;
  label: string;
  filters: unknown;
  hidden_columns: string[];
  created_at: string;
  updated_at: string;
}
