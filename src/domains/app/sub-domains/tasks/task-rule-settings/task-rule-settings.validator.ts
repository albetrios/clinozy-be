import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { ReplaceTaskRulesDto, type ReplaceTaskRulesInput } from './task-rule-settings.dto.js';

/** Parses a save of the rule switches; throws `ValidationError` naming each bad field. */
export function validateReplaceTaskRules(data: unknown): ReplaceTaskRulesInput {
  return parseWithSchema({ schema: ReplaceTaskRulesDto, data });
}
