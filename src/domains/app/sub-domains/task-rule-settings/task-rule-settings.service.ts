// hand-edited — one settings row per rule, read and saved as the whole rule list.
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { PAGINATION } from '@/shared/constants/pagination.constants.js';
import { TASK_RULE_SETTING_RULE_KEY_VALUES } from './task-rule-settings.constants.js';
import type { TaskRuleSettingsRepository } from './task-rule-settings.repository.js';
import { serializeTaskRuleSetting } from './task-rule-settings.serializer.js';
import type { TaskRuleSettingOutput } from './task-rule-settings.types.js';
import {
  validateCreateTaskRuleSetting,
  validateListTaskRuleSettingsQuery,
  validateReplaceTaskRules,
  validateUpdateTaskRuleSetting,
} from './task-rule-settings.validator.js';

/**
 * One task rule as `GET /app/task-rule-settings` returns it — the saved row, or the default (`id: null`).
 *
 * @remarks
 * - **Notes:** every rule starts on and not automatic until the organization saves it.
 */
export type TaskRuleOutput =
  | TaskRuleSettingOutput
  | {
      id: null;
      rule_key: string;
      is_on: boolean;
      is_automatic: boolean;
      created_at: null;
      updated_at: null;
    };

/**
 * The organization's task rules (launch ROUTE #60, RC-188/RC-189): whether each rule creates
 * tasks, and whether the organization lets the app handle it by itself.
 *
 * @remarks
 * - **Algorithm:** the shared app record service over `app.task_rule_settings`; `listRules` merges
 *   the saved rows over the defaults (every rule on, none automatic) in the rule order;
 *   `replaceRules` updates each named rule's row, or creates it on its first save.
 * - **Failure modes:** `ValidationError` for a bad body (an unknown rule, a rule named twice);
 *   `ConflictError` when two saves create the same rule's row at once.
 * - **Side effects:** a save inserts or updates one row per named rule.
 */
export class TaskRuleSettingsService extends BaseRecordService<TaskRuleSettingOutput> {
  constructor(organizationService: OrganizationService, repository: TaskRuleSettingsRepository) {
    super(organizationService, {
      label: 'Task rule setting',
      repository,
      parseCreate: validateCreateTaskRuleSetting,
      parseUpdate: validateUpdateTaskRuleSetting,
      parseList: validateListTaskRuleSettingsQuery,
      serialize: serializeTaskRuleSetting,
      conflicts: {
        idx_task_rule_settings_organization_rule_unique: 'errors:recordAlreadyExists',
      },
    });
  }

  /**
   * Every task rule with the organization's setting, or the default before its first save.
   *
   * @remarks
   * - **Algorithm:** one read of the saved rows (at most one per rule), merged in rule order.
   * - **Failure modes:** none beyond the read.
   */
  async listRules(scope: OrganizationPrincipalDatabaseScope): Promise<TaskRuleOutput[]> {
    const page = await this.list(scope, { limit: PAGINATION.MAX_LIMIT });
    const saved = new Map(page.items.map((item) => [item.rule_key, item]));
    return TASK_RULE_SETTING_RULE_KEY_VALUES.map(
      (ruleKey) =>
        saved.get(ruleKey) ?? {
          id: null,
          rule_key: ruleKey,
          is_on: true,
          is_automatic: false,
          created_at: null,
          updated_at: null,
        },
    );
  }

  /**
   * Saves the named rules' switches and returns the whole rule list.
   *
   * @remarks
   * - **Algorithm:** read the saved rows; update each named rule's row, or create it with the sent
   *   switches over the defaults; then re-read the merged list.
   * - **Failure modes:** `ValidationError`; `ConflictError` (`errors:recordAlreadyExists`) when a
   *   concurrent save created the same rule's row first — retrying succeeds.
   */
  async replaceRules(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    actingUserPublicId: string | undefined,
  ): Promise<TaskRuleOutput[]> {
    const { rules } = validateReplaceTaskRules(body);
    const page = await this.list(scope, { limit: PAGINATION.MAX_LIMIT });
    const saved = new Map(page.items.map((item) => [item.rule_key, item]));
    for (const { rule_key: ruleKey, ...switches } of rules) {
      const existing = saved.get(ruleKey);
      if (existing) {
        if (Object.keys(switches).length > 0) {
          await this.update(scope, existing.id, switches, actingUserPublicId);
        }
      } else {
        await this.create(scope, { rule_key: ruleKey, ...switches }, actingUserPublicId);
      }
    }
    return this.listRules(scope);
  }
}
