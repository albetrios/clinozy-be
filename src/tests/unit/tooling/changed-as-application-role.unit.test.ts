import { describe, expect, it } from 'vitest';
import {
  APPLICATION_ROLE_PROJECTS,
  applicationRoleTests,
  OWN_TESTS_DOMAINS,
} from '@tooling/vitest/changed-as-application-role.js';
import type { TestSelection } from '@tooling/vitest/test-selection.util.js';

const PATIENTS_SERVICE = 'src/domains/app/sub-domains/patients/patients.service.ts';
const PATIENTS_INTEGRATION =
  'src/domains/app/sub-domains/patients/__tests__/integration/patients.integration.test.ts';
const TENANCY_INTEGRATION = 'src/domains/tenancy/__tests__/integration/tenancy.integration.test.ts';
const TENANCY_ONBOARDING = 'src/domains/tenancy/__tests__/e2e/organization-onboarding.e2e.test.ts';
const TENANCY_UNIT =
  'src/domains/tenancy/sub-domains/membership/__tests__/unit/membership.validator.unit.test.ts';
const TEST_FILES = [PATIENTS_INTEGRATION, TENANCY_INTEGRATION, TENANCY_ONBOARDING, TENANCY_UNIT];

/** A selection of `projects`, each test picked for the change (none only because it always runs). */
const selected = (projects: Record<string, string[]>): TestSelection => ({
  mode: 'selected',
  reasons: ['picked'],
  projects,
  why: Object.fromEntries(
    Object.values(projects)
      .flat()
      .map((test) => [test, [`next to ${PATIENTS_SERVICE}`]]),
  ),
});

/**
 * Pins what pre-push runs as the application role (`pnpm test:rls-role:changed`): the e2e and
 * integration tests of the pushed domain code, so an RLS-only regression such as
 * pull request #125's stops at push rather than 5.4 minutes into CI.
 */
describe('the application-role tests at push', () => {
  it('runs the e2e and integration files pnpm test:select picks, never its unit files', () => {
    const asked: string[][] = [];
    const plan = applicationRoleTests({
      changedFiles: [PATIENTS_SERVICE, 'docs/x.md'],
      testFiles: TEST_FILES,
      select: (changedFiles) => {
        asked.push(changedFiles);
        return selected({
          integration: [PATIENTS_INTEGRATION],
          unit: [
            'src/domains/app/sub-domains/patients/__tests__/unit/patients.service.unit.test.ts',
          ],
        });
      },
    });
    expect(asked).toEqual([[PATIENTS_SERVICE]]);
    expect(plan.files).toEqual([PATIENTS_INTEGRATION]);
    expect(APPLICATION_ROLE_PROJECTS).toEqual(['e2e', 'integration']);
  });

  it("runs a core domain's own e2e and integration tests instead of the selection", () => {
    expect(OWN_TESTS_DOMAINS).toEqual(['tenancy', 'user', 'auth', 'audit']);
    const plan = applicationRoleTests({
      changedFiles: ['src/domains/tenancy/sub-domains/membership/membership.service.ts'],
      testFiles: TEST_FILES,
      select: () => {
        throw new Error('a core domain file is not sent to the selector');
      },
    });
    expect(plan.files).toEqual([TENANCY_ONBOARDING, TENANCY_INTEGRATION]);
    expect(plan.reasons).toEqual([
      '1 changed file(s) in tenancy, a core domain: its 2 e2e and integration test file(s)',
    ]);
  });

  it('sends a changed database test to the selector, so it selects itself only', () => {
    const plan = applicationRoleTests({
      changedFiles: [TENANCY_INTEGRATION],
      testFiles: TEST_FILES,
      select: (changedFiles) => selected({ integration: changedFiles }),
    });
    expect(plan.files).toEqual([TENANCY_INTEGRATION]);
  });

  it('selects nothing for unit tests, docs and code outside src/domains/, and says why for an escalation', () => {
    const none = applicationRoleTests({
      changedFiles: [
        'src/domains/app/sub-domains/patients/__tests__/unit/patients.service.unit.test.ts',
        'src/shared/utils/http/response.util.ts',
        'docs/x.md',
      ],
      testFiles: TEST_FILES,
      select: () => {
        throw new Error('nothing relevant reaches the selector');
      },
    });
    expect(none).toEqual({ files: [], reasons: [] });
    const escalated = applicationRoleTests({
      changedFiles: ['src/domains/index.ts'],
      testFiles: TEST_FILES,
      select: () => ({
        mode: 'all',
        reasons: ['src/domains/index.ts is on the escalation list, so everything runs'],
        projects: {},
        why: {},
      }),
    });
    expect(escalated.files).toEqual([]);
    expect(escalated.reasons[0]).toContain(
      'everything is selected, so the full suite is the signal',
    );
  });
});
