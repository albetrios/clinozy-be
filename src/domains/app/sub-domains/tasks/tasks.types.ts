/** The person a task is about, as the drawer shows them (the screen warns on `no_calls`). */
export interface TaskContactOutput {
  id: string;
  name: string;
  primary_phone: string | null;
  preference_tags: string[];
}

/**
 * The Tasks type filter (D81 T6): the rules and the kinds a list asks for — a task of any of them
 * (`rule_key IN (…) OR kind IN (…)`), so "Follow-ups you set" (the `follow_up` and `manual` kinds)
 * shows beside the rules picked.
 */
export interface TaskTypeFilter {
  ruleKeys: string[];
  kinds: string[];
}

/** One owner change of a task (TK8). */
export interface TaskOwnerChangeOutput {
  from_membership_id: string | null;
  from_role: string | null;
  to_membership_id: string | null;
  to_role: string | null;
  changed_by_membership_id: string | null;
  created_at: string;
}

/**
 * A task as the API returns it (launch ROUTE #138, routes-final 10.A.6).
 *
 * @remarks
 * - **Notes:** an owner or a role queue (TK6); the person and at most one record (TK5); its
 *   lifecycle and outcome (TK7); the latest owner changes (TK8); `can_clinozy_handle` — its rule has
 *   a step the server can take (TK10); `next_task_id` the follow-up a resolve just set.
 */
export interface TaskOutput {
  id: string;
  kind: string;
  rule_key: string | null;
  title: string;
  why: string | null;
  owner_membership_id: string | null;
  owner_role: string | null;
  contact: TaskContactOutput | null;
  lead_id: string | null;
  appointment_id: string | null;
  patient_treatment_id: string | null;
  patient_check_in_id: string | null;
  patient_review_id: string | null;
  invoice_id: string | null;
  pending_credit_id: string | null;
  medical_rep_id: string | null;
  branch_id: string | null;
  due_at: string;
  status: string;
  snoozed_until: string | null;
  snooze_label: string | null;
  outcome: string | null;
  result_text: string | null;
  note: string | null;
  resolved_at: string | null;
  is_resolved_automatically: boolean;
  resolved_by_membership_id: string | null;
  priority: string;
  owner_changes: TaskOwnerChangeOutput[];
  can_clinozy_handle: boolean;
  next_task_id: string | null;
  created_at: string;
  updated_at: string;
}
