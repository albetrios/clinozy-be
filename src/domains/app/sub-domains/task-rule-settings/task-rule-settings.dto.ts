// hand-edited — adds the replace-the-rules body of `PUT /app/task-rule-settings`.
import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { TASK_RULE_SETTING_RULE_KEY_VALUES } from './task-rule-settings.constants.js';

/** Path params of the by-id `task-rule-settings` routes. */
export const taskRuleSettingsIdParamsDto = z
  .object({
    task_rule_setting_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new task rule setting. */
export const CreateTaskRuleSettingDto = z
  .object({
    rule_key: z.enum(TASK_RULE_SETTING_RULE_KEY_VALUES),
    is_on: z.boolean().optional(),
    is_automatic: z.boolean().optional(),
  })
  .strict();

/** Body of `PATCH /app/task-rule-settings/{task_rule_setting_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateTaskRuleSettingDto = z
  .object({
    rule_key: z.enum(TASK_RULE_SETTING_RULE_KEY_VALUES).optional(),
    is_on: z.boolean().optional(),
    is_automatic: z.boolean().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `task-rule-settings` list — keyset paging, `q` search, sort and filters. */
export const listTaskRuleSettingsQueryDto = listSearchSortSchema(['created_at'] as const);

/** Parsed {@link CreateTaskRuleSettingDto}. */
export type CreateTaskRuleSettingInput = z.infer<typeof CreateTaskRuleSettingDto>;
/** Parsed {@link UpdateTaskRuleSettingDto}. */
export type UpdateTaskRuleSettingInput = z.infer<typeof UpdateTaskRuleSettingDto>;

/** One rule switch in `PUT /app/task-rule-settings` — the fields not sent keep their value. */
const TaskRuleSwitchDto = z
  .object({
    rule_key: z.enum(TASK_RULE_SETTING_RULE_KEY_VALUES),
    is_on: z.boolean().optional(),
    is_automatic: z.boolean().optional(),
  })
  .strict();

/** Body of `PUT /app/task-rule-settings`: the rules to switch, each named once. */
export const ReplaceTaskRulesDto = z
  .object({
    rules: z
      .array(TaskRuleSwitchDto)
      .min(1)
      .max(TASK_RULE_SETTING_RULE_KEY_VALUES.length)
      .refine((rules) => new Set(rules.map((rule) => rule.rule_key)).size === rules.length, {
        message: 'Name each rule once',
      }),
  })
  .strict();

/** Parsed {@link ReplaceTaskRulesDto}. */
export type ReplaceTaskRulesInput = z.infer<typeof ReplaceTaskRulesDto>;
