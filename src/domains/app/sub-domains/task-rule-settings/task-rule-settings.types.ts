/** A task rule setting as the API returns it (launch ROUTE #60). */
export interface TaskRuleSettingOutput {
  id: string;
  rule_key: string;
  is_on: boolean;
  is_automatic: boolean;
  created_at: string;
  updated_at: string;
}
