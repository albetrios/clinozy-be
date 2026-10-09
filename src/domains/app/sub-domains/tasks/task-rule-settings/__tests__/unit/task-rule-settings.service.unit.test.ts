import { describe, expect, it } from 'vitest';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { ValidationError } from '@/shared/errors/index.js';
import { TaskRuleSettingsService } from '@/domains/app/sub-domains/tasks/task-rule-settings/task-rule-settings.service.js';

/** A scope no database work ever reads — every case is refused before one opens. */
const SCOPE = {
  organizationPublicId: 'org_aaaaaaaaaaaaaaaaaaaaa',
} as unknown as OrganizationPrincipalDatabaseScope;

/**
 * Task rule switches (routes-final 10.B, ROUTE #138): every write and read the service parses is refused before any database work — the
 * service is built with no repositories, so a case that reached one would fail.
 */
describe('TaskRuleSettingsService', () => {
  const service = new TaskRuleSettingsService({} as never, {} as never);

  it('refuses a save without its rules (400)', async () => {
    await expect(service.replaceRules(SCOPE, {}, undefined)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses a rule that is not one of the 15 (400)', async () => {
    await expect(
      service.replaceRules(
        SCOPE,
        { rules: [{ rule_key: 'not_a_rule', is_on: true, is_automatic: false }] },
        undefined,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses "Let Clinozy handle" on a rule Clinozy cannot take (400)', async () => {
    await expect(
      service.replaceRules(
        SCOPE,
        { rules: [{ rule_key: 'arrive', is_on: true, is_automatic: true }] },
        undefined,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
