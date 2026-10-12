import { z } from 'zod';
import { TASK_RULE_VALUES } from '@/domains/app/sub-domains/tasks/tasks.constants.js';

/**
 * Body of `PUT /app/task-rule-settings` (10.B.8 #12): `rules*` — 1–14 rules, each once, with
 * `is_on` and `is_automatic` ("Let the app handle"); a rule not sent keeps its switches.
 */
export const ReplaceTaskRulesDto = z
  .object({
    rules: z
      .array(
        z
          .object({
            rule_key: z.enum(TASK_RULE_VALUES),
            is_on: z.boolean().optional(),
            is_automatic: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(TASK_RULE_VALUES.length)
      .refine((rules) => new Set(rules.map((rule) => rule.rule_key)).size === rules.length, {
        message: 'errors:validation.eachRuleOnce',
      }),
  })
  .strict();

/** Parsed {@link ReplaceTaskRulesDto}. */
export type ReplaceTaskRulesInput = z.infer<typeof ReplaceTaskRulesDto>;
