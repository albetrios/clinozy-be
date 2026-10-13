import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  type EnvironmentKeyScope,
  getGithubEnvironmentNames,
  isKeyInEnvironmentScope,
  loadConfig,
  resolveEnvironmentKeyScope,
} from '@tooling/setup/common/config.js';
import {
  validateGithubSyncConsistency,
  validateScopedEnvironments,
} from '@tooling/setup/github/sync-config.js';
import {
  mayCreateMissingEnvironment,
  scopeEntries,
} from '@tooling/setup/github/sync-github-environments.js';

const ROOT = process.cwd();
const DRILL_KEY = 'MONTHLY_DATABASE_RESTORE_DRILL_NEON_API_KEY';
const DRILL_ENVIRONMENT = 'production-restore-drill';

/**
 * A scoped environment is a GitHub Environment that is not a deploy target: it takes a few keys
 * from a deploy environment's file, and that environment stops receiving them. The restore drills
 * use one so they run unattended — the `production` environment's approval gate would hold every
 * scheduled drill — while still reaching nothing but the Neon key.
 */
describe('github:sync scoped environments', () => {
  const config = loadConfig();

  describe('key scope', () => {
    it('gives the drill environment the Neon key alone, read from the production file', () => {
      const scope = resolveEnvironmentKeyScope(config, DRILL_ENVIRONMENT);
      expect(scope).toEqual({
        sourceEnvironment: 'production',
        includeKeys: [DRILL_KEY],
        excludeKeys: [],
      });
    });

    it('stops pushing the key to production, so it lives in one GitHub Environment', () => {
      const scope = resolveEnvironmentKeyScope(config, 'production');
      expect(scope.sourceEnvironment).toBe('production');
      expect(scope.includeKeys).toBeNull();
      expect(scope.excludeKeys).toEqual([DRILL_KEY]);
    });

    it('leaves an environment no scoped environment draws on untouched', () => {
      expect(resolveEnvironmentKeyScope(config, 'development')).toEqual({
        sourceEnvironment: 'development',
        includeKeys: null,
        excludeKeys: [],
      });
    });

    it('filters a source file to the scope — out-of-scope keys are not even declared', () => {
      const entries = [
        { name: 'DATABASE_URL', value: 'postgresql://x' },
        { name: DRILL_KEY, value: 'neon-key' },
        { name: 'SENTRY_DSN', value: '' },
      ];
      const drillScope: EnvironmentKeyScope = {
        sourceEnvironment: 'production',
        includeKeys: [DRILL_KEY],
        excludeKeys: [],
      };
      const productionScope: EnvironmentKeyScope = {
        sourceEnvironment: 'production',
        includeKeys: null,
        excludeKeys: [DRILL_KEY],
      };
      expect(scopeEntries(entries, drillScope).map((entry) => entry.name)).toEqual([DRILL_KEY]);
      expect(scopeEntries(entries, productionScope).map((entry) => entry.name)).toEqual([
        'DATABASE_URL',
        'SENTRY_DSN',
      ]);
      expect(isKeyInEnvironmentScope(productionScope, DRILL_KEY)).toBe(false);
      expect(isKeyInEnvironmentScope(drillScope, 'DATABASE_URL')).toBe(false);
    });
  });

  describe('manifest consistency', () => {
    it('lists the drill environment among the GitHub Environments sync creates and protects', () => {
      expect(getGithubEnvironmentNames(config)).toEqual([
        'development',
        'production',
        DRILL_ENVIRONMENT,
      ]);
    });

    it('passes the consistency check as committed', () => {
      expect(validateGithubSyncConsistency(config)).toEqual([]);
    });

    it('rejects an unknown source, a reused name, a missing JSON, an undeclared key and a shared key', () => {
      const issues = validateScopedEnvironments({
        scopedEnvironments: [
          { name: 'production', source: 'staging', keys: ['NOT_IN_EXAMPLE'], purpose: 'x' },
          { name: 'first-scope', source: 'production', keys: [DRILL_KEY], purpose: 'x' },
          { name: 'second-scope', source: 'production', keys: [DRILL_KEY], purpose: 'x' },
        ],
        deployEnvironmentNames: new Set(['development', 'production']),
        githubEnvironmentNames: new Set(['development', 'production', 'first-scope']),
        exampleContent: `${DRILL_KEY}=\n`,
      });
      const details = issues.map((issue) => issue.detail);
      expect(details).toContain(
        'Scoped environment "production" reuses a deploy environment\'s name.',
      );
      expect(details).toContain(
        'Scoped environment "production" takes its keys from "staging", which is not a configured environment.',
      );
      expect(details).toContain(
        'Scoped environment "second-scope" has no .github/environments/second-scope.json.',
      );
      expect(details).toContain(
        'Scoped environment "production" names NOT_IN_EXAMPLE, which .env.example does not declare.',
      );
      expect(details).toContain(
        `${DRILL_KEY} from "production" is taken by both "first-scope" and "second-scope".`,
      );
    });
  });

  describe('never fails open', () => {
    it('refuses to create a missing scoped environment from the value sync', () => {
      // The value sync creates environments with no protection; `--only` and the direct entry
      // point skip the protection step. Created there, the drill environment would hand the Neon
      // key to every branch — so it must already exist, protected from its committed JSON.
      expect(
        mayCreateMissingEnvironment(resolveEnvironmentKeyScope(config, DRILL_ENVIRONMENT)),
      ).toBe(false);
      expect(mayCreateMissingEnvironment(resolveEnvironmentKeyScope(config, 'production'))).toBe(
        true,
      );
    });
  });

  describe('the restore drills use it', () => {
    it('protects the drill environment with the branch policy alone — no reviewers to wait on', () => {
      const environmentConfig = JSON.parse(
        readFileSync(join(ROOT, '.github/environments', `${DRILL_ENVIRONMENT}.json`), 'utf8'),
      ) as {
        name: string;
        protection: { requiredReviewers?: unknown; deploymentBranchPolicy?: unknown };
      };
      expect(environmentConfig.name).toBe(DRILL_ENVIRONMENT);
      expect(environmentConfig.protection.requiredReviewers).toBeUndefined();
      expect(environmentConfig.protection.deploymentBranchPolicy).toEqual({
        protectedBranches: true,
        customBranchPolicies: false,
      });
    });

    it('runs both drill jobs in the drill environment while naming the production Neon project', () => {
      for (const workflowFileName of [
        'scheduled-monthly-restore-rto.yml',
        'scheduled-weekly-restore-smoke.yml',
      ]) {
        const workflow = readFileSync(join(ROOT, '.github/workflows', workflowFileName), 'utf8');
        expect(workflow, workflowFileName).toContain(
          `echo "github_environment=${DRILL_ENVIRONMENT}" >> "$GITHUB_OUTPUT"`,
        );
        expect(workflow, workflowFileName).toContain(
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression in the workflow YAML — not a TS template.
          'environment: ${{ needs.resolve-environment.outputs.github_environment }}',
        );
        expect(workflow, workflowFileName).not.toContain(
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression in the workflow YAML — not a TS template.
          'environment: ${{ needs.resolve-environment.outputs.environment }}',
        );
      }
    });
  });
});
