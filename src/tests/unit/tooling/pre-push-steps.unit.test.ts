import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectionTable } from '@tooling/vitest/affected.js';
import {
  BRANCH_TYPES,
  branchNameProblem,
  isApplicationRoleRelevant,
  prePushSteps,
  shouldRunSonarScan,
} from '@tooling/validate/pre-push-steps.js';

const BASE = 'origin/main';
const labels = (changedFiles: string[]) =>
  prePushSteps({ changedFiles, base: BASE })
    .filter((step) => step.runs)
    .map((step) => step.label);

/**
 * Pins the one pre-push step list (`tooling/validate/pre-push-steps.ts`): `.husky/pre-push` runs
 * it through `pnpm guard:pre-push`, `pnpm test:affected` previews it — one list, so the preview
 * never describes a push that runs another way.
 */
describe('the pre-push steps', () => {
  it('is the whole hook', () => {
    const hook = readFileSync(join(process.cwd(), '.husky', 'pre-push'), 'utf8');
    const commands = hook.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'));
    expect(commands).toEqual(['pnpm guard:pre-push']);
  });

  it('always checks the branch name, types and builds; the rest when the pushed files need it', () => {
    expect(labels([])).toEqual([
      'branch-name policy',
      'pnpm typecheck',
      'pnpm build',
      'pnpm build:check',
    ]);
    expect(labels(['docs/x.md'])).toContain('pnpm docs:lint:changed');
    expect(labels(['docs/routes.txt'])).toContain('pnpm routes:catalog:check');
    expect(labels(['docs/reference/commands.md'])).not.toContain('pnpm routes:catalog:check');
    // A tooling-only push runs the tests that read the changed tooling (src/tests/unit/tooling).
    expect(labels(['tooling/ci/check-load-coverage.mjs'])).toContain('pnpm test:pre-push');
    expect(labels(['docs/x.md'])).not.toContain('pnpm test:pre-push');
    // The CI policy tests read the workflows and the hook tests spawn the hooks, so a push of
    // only a workflow or only a hook runs the ones naming it.
    for (const file of [
      '.github/workflows/post-merge-ci.yml',
      'agent-os/hooks/be-push-ci-watch.mjs',
      'pnpm-workspace.yaml',
    ])
      expect(labels([file]), file).toContain('pnpm test:pre-push');
    // The generated platform files are checked when agent-os/ or its generator is pushed.
    expect(labels(['agent-os/hooks/hooks.json'])).toContain('pnpm agent-os:generate:check');
    expect(labels(['tooling/agent-os/generate.ts'])).toContain('pnpm agent-os:generate:check');
    expect(labels(['src/domains/auth/auth.service.ts'])).not.toContain(
      'pnpm agent-os:generate:check',
    );
    // An edited skill left unlocked (#130) is caught at push, not first in CI.
    for (const file of [
      'agent-os/skills/be-skill-index/SKILL.md',
      'tooling/agent-os/skills-lock.ts',
    ])
      expect(labels([file]), file).toContain('pnpm agent-os:check');
    expect(labels(['src/domains/auth/auth.service.ts'])).not.toContain('pnpm agent-os:check');
    // Semgrep scans every pushed source file, the app domain included.
    expect(labels(['src/domains/app/sub-domains/leads/leads.validator.ts'])).toContain(
      'pnpm security:semgrep:push',
    );
    expect(labels(['src/domains/auth/auth.service.ts'])).toEqual(
      expect.arrayContaining([
        'pnpm security:semgrep:push',
        'pnpm test:pre-push',
        'pnpm test:rls-role:changed',
        'pnpm sonar:scan',
      ]),
    );
  });

  it('runs the application-role tests for code and database tests under src/domains/ only', () => {
    // Pull request #125: an organization lookup outside the database context passed a
    // green pre-push, because every local lane bypasses RLS.
    for (const file of [
      'src/domains/app/sub-domains/patients/patients.service.ts',
      'src/domains/tenancy/__tests__/integration/tenancy.integration.test.ts',
      'src/domains/app/__tests__/e2e/flow-enquiry-to-patient.e2e.test.ts',
    ]) {
      expect(isApplicationRoleRelevant(file), file).toBe(true);
      expect(labels([file]), file).toContain('pnpm test:rls-role:changed');
    }
    for (const file of [
      'src/domains/app/sub-domains/patients/__tests__/unit/patients.service.unit.test.ts',
      'src/domains/app/sub-domains/patients/patients.validator.unit.test.ts',
      'src/shared/utils/http/response.util.ts',
      'src/domains/app/sub-domains/patients/patients.overview.md',
      'tooling/vitest/projects.ts',
    ]) {
      expect(isApplicationRoleRelevant(file), file).toBe(false);
      expect(labels([file]), file).not.toContain('pnpm test:rls-role:changed');
    }
  });

  it('passes the one push base to every step that measures a diff', () => {
    const steps = prePushSteps({
      changedFiles: ['src/domains/auth/auth.service.ts', 'a.md'],
      base: BASE,
    });
    for (const label of [
      'pnpm docs:lint:changed',
      'pnpm security:semgrep:push',
      'pnpm test:pre-push',
      'pnpm test:rls-role:changed',
    ]) {
      expect(steps.find((step) => step.label === label)?.pnpmArguments.slice(-2), label).toEqual([
        '--base',
        BASE,
      ]);
    }
  });

  it('runs the SonarQube gate for deployed-surface code only', () => {
    expect(shouldRunSonarScan(['src/domains/auth/auth.service.ts'])).toBe(true);
    expect(shouldRunSonarScan(['src/shared/utils/http/response.util.ts'])).toBe(true);
    // Tests, scripts, and tooling are excluded from Sonar analysis.
    expect(shouldRunSonarScan(['src/domains/auth/__tests__/auth.test.ts'])).toBe(false);
    expect(shouldRunSonarScan(['src/domains/auth/auth.service.test.ts'])).toBe(false);
    expect(shouldRunSonarScan(['src/tests/unit/scripts/run-pre-commit-guard.unit.test.ts'])).toBe(
      false,
    );
    expect(shouldRunSonarScan(['src/scripts/tooling/run-pre-commit-guard.ts'])).toBe(false);
    expect(shouldRunSonarScan(['tooling/sonar/sonar-gate.ts'])).toBe(false);
    expect(shouldRunSonarScan(['docs/README.md'])).toBe(false);
  });

  it('holds working branches to <type>/<description>, allowing the trunk and claude/*', () => {
    expect(branchNameProblem({ branch: 'chore/agent-ci-all-waves', trunk: 'main' })).toBe('');
    expect(branchNameProblem({ branch: 'claude/session-x', trunk: 'main' })).toBe('');
    expect(branchNameProblem({ branch: 'main', trunk: 'main' })).toBe('');
    expect(branchNameProblem({ branch: 'HEAD', trunk: 'main' })).toBe('');
    expect(branchNameProblem({ branch: 'my-branch', trunk: 'main' })).toContain(
      `Allowed types: ${BRANCH_TYPES.join('|')}`,
    );
  });

  it('summarizes the always-run tests in the preview', () => {
    const table = selectionTable({
      mode: 'selected',
      reasons: ['2 of 9'],
      projects: { unit: ['src/a.unit.test.ts', 'src/b.unit.test.ts'] },
      why: { 'src/a.unit.test.ts': ['next to src/a.ts'], 'src/b.unit.test.ts': ['always run'] },
    });
    expect(table).toContain('| unit | `src/a.unit.test.ts` | next to src/a.ts |');
    expect(table).toContain('| unit | 1 file(s) | always run (any source change) |');
  });
});
