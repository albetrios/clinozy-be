import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import type { TaskRuleSettingOutput } from './task-rule-settings.types.js';

/** Shapes a `app.task_rule_settings` row as the API returns it (public ids, numbers, ISO times). */
export function serializeTaskRuleSetting(
  row: BaseRecordRow,
  _references: BaseRecordReferenceLookup,
): TaskRuleSettingOutput {
  return {
    id: row.public_id,
    rule_key: row.rule_key as string,
    is_on: row.is_on as boolean,
    is_automatic: row.is_automatic as boolean,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
