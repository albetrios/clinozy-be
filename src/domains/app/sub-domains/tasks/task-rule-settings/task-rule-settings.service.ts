import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { fieldValidationError } from '@/shared/errors/index.js';
import {
  TASK_AUTOMATIC_RULE_VALUES,
  TASK_RULE_VALUES,
} from '@/domains/app/sub-domains/tasks/tasks.constants.js';
import type { TaskRuleSettingsRepository } from './task-rule-settings.repository.js';
import type { TaskRuleSettingOutput } from './task-rule-settings.types.js';
import { validateReplaceTaskRules } from './task-rule-settings.validator.js';

/**
 * The organization's task rule switches (launch ROUTE #138, routes-final 10.B, TK10): every rule
 * with whether it is on and whether the app handles it, and their save.
 *
 * @remarks
 * - **Algorithm:** `listRules` merges the saved rows over the defaults (on, by hand) in the rule
 *   order; `replaceRules` upserts each sent rule in one transaction (a save never half-applies),
 *   then answers with all fourteen. Reading needs `task:read`, saving `organization:update` (the
 *   routes' gates, TK2).
 * - **Failure modes:** `ValidationError` on `rules` (empty, an unknown or repeated rule) or
 *   `is_automatic` (a rule with no step the app can take).
 * - **Side effects:** a save writes one row per sent rule.
 */
export class TaskRuleSettingsService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly repository: TaskRuleSettingsRepository,
  ) {}

  /** Every rule with its switches, in the Rules popover's order. */
  async listRules(scope: OrganizationPrincipalDatabaseScope): Promise<TaskRuleSettingOutput[]> {
    return withAppDatabaseContext(scope, async () => this.readRules(scope));
  }

  /** Saves the sent rules' switches in one transaction and answers with every rule. */
  async replaceRules(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    actingUserPublicId: string | undefined,
  ): Promise<TaskRuleSettingOutput[]> {
    const { rules } = validateReplaceTaskRules(body);
    rules.forEach((rule, index) => {
      if (
        rule.is_automatic &&
        !(TASK_AUTOMATIC_RULE_VALUES as readonly string[]).includes(rule.rule_key)
      ) {
        throw fieldValidationError({
          field: `rules/${index}/is_automatic`,
          messageKey: 'errors:validation.taskRuleNotAutomatic',
          messageParams: { rule: rule.rule_key },
        });
      }
    });
    return withAppDatabaseContext(scope, async () => {
      const organizationId = await this.organizationId(scope);
      const userId =
        (await this.organizationService.resolveUserInternalIdByPublicId(actingUserPublicId)) ??
        null;
      for (const rule of rules) {
        await this.repository.upsert({
          organizationId,
          ruleKey: rule.rule_key,
          isOn: rule.is_on,
          isAutomatic: rule.is_automatic,
          userId,
        });
      }
      return this.readRules(scope);
    });
  }

  /** The saved rows merged over the defaults, inside the caller's context. */
  private async readRules(
    scope: OrganizationPrincipalDatabaseScope,
  ): Promise<TaskRuleSettingOutput[]> {
    const saved = new Map(
      (await this.repository.findAll(await this.organizationId(scope))).map((row) => [
        row.rule_key,
        row,
      ]),
    );
    return TASK_RULE_VALUES.map((ruleKey) => {
      const row = saved.get(ruleKey);
      return {
        id: row?.public_id ?? null,
        rule_key: ruleKey,
        is_on: row?.is_on ?? true,
        is_automatic: row?.is_automatic ?? false,
        can_be_automatic: (TASK_AUTOMATIC_RULE_VALUES as readonly string[]).includes(ruleKey),
        updated_at: row ? row.updated_at.toISOString() : null,
      };
    });
  }

  /** The active organization's internal id. */
  private async organizationId(scope: OrganizationPrincipalDatabaseScope): Promise<number> {
    const organization = await this.organizationService.requireOrganizationByPublicId(
      scope.organizationPublicId,
    );
    return organization.id;
  }
}
