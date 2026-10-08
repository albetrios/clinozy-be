/**
 * A task rule's switches as the API returns them (launch ROUTE #138, routes-final 10.B.6).
 *
 * @remarks
 * - **Notes:** `id` and `updated_at` are null for a rule never saved (on, by hand);
 *   `can_be_automatic` — the rule has a step Clinozy can take (TK10).
 */
export interface TaskRuleSettingOutput {
  id: string | null;
  rule_key: string;
  is_on: boolean;
  is_automatic: boolean;
  can_be_automatic: boolean;
  updated_at: string | null;
}
