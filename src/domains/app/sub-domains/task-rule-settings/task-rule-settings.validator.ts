// hand-edited — adds the `PUT /app/task-rule-settings` body parser.
import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateTaskRuleSettingDto,
  type CreateTaskRuleSettingInput,
  listTaskRuleSettingsQueryDto,
  ReplaceTaskRulesDto,
  type ReplaceTaskRulesInput,
  UpdateTaskRuleSettingDto,
  type UpdateTaskRuleSettingInput,
} from './task-rule-settings.dto.js';

/** Parses a task rule setting create body; throws `ValidationError` naming each bad field. */
export function validateCreateTaskRuleSetting(data: unknown): CreateTaskRuleSettingInput {
  return parseWithSchema(CreateTaskRuleSettingDto, data);
}

/** Parses a task rule setting update body; throws `ValidationError` naming each bad field. */
export function validateUpdateTaskRuleSetting(data: unknown): UpdateTaskRuleSettingInput {
  return parseWithSchema(UpdateTaskRuleSettingDto, data);
}

/** Parses the `GET /app/task-rule-settings` query into a list input (filters by column). */
export function validateListTaskRuleSettingsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listTaskRuleSettingsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
  };
}

/** Parses a `PUT /app/task-rule-settings` body; throws `ValidationError` naming each bad field. */
export function validateReplaceTaskRules(data: unknown): ReplaceTaskRulesInput {
  return parseWithSchema(ReplaceTaskRulesDto, data);
}
