/** A lead message as the API returns it (launch ROUTE #15). */
export interface LeadMessageOutput {
  id: string;
  lead_id: string;
  channel: string;
  direction: string;
  body: string;
  delivery_status: string;
  is_system: boolean;
  author_membership_id: string | null;
  sent_at: string;
  /** What the line points at (an appointment, an invoice…) */
  record_type: string | null;
  /** That record's public id */
  record_id: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}
