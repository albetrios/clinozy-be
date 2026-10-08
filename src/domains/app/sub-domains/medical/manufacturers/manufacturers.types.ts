/** A record a manufacturer links to, by id and name (11.A.6). */
export interface ManufacturerLinkOutput {
  id: string;
  name: string;
}

/**
 * A manufacturer as the API returns it (launch ROUTE #153, routes-final 11.A.6).
 *
 * @remarks
 * - **Notes:** `medicine_count`, `suppliers` and `medical_reps` are worked out on read (the rules'
 *   `decorate`) — live records only.
 */
export interface ManufacturerOutput {
  id: string;
  name: string;
  tone: string;
  /** Added inline from a picker */
  is_quick: boolean;
  medicine_count: number;
  suppliers: ManufacturerLinkOutput[];
  medical_reps: ManufacturerLinkOutput[];
  created_at: string;
  updated_at: string;
}
