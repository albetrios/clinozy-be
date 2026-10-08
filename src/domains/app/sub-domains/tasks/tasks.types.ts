/** A task as the API returns it (launch ROUTE #58). */
export interface TaskOutput {
  id: string;
  kind: string;
  /** The rule that made it */
  rule_key: string | null;
  title: string;
  why: string | null;
  owner_membership_id: string | null;
  /** The role queue — where the task falls back when no one owns it */
  owner_role: string;
  patient_id: string | null;
  lead_id: string | null;
  source_type: string | null;
  /** The source record's public id */
  source_id: string | null;
  due_at: string;
  status: string;
  snoozed_until: string | null;
  snooze_label: string | null;
  outcome: string | null;
  resolved_at: string | null;
  /** "Done automatically" — closed by the app */
  is_resolved_automatically: boolean;
  result_text: string | null;
  note: string | null;
  priority: string;
  should_remind_before: boolean;
  created_at: string;
  updated_at: string;
}
