import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const deployWorkflow = readFileSync('.github/workflows/reusable-railway-deploy.yml', 'utf8');

/**
 * NODE_ENV follows the deploy target. The runtime image defaults to `NODE_ENV=production`
 * (Dockerfile), and NODE_ENV used to reach Railway only if `pnpm github:sync` had pushed it
 * from `.env.<environment>` — so a development GitHub Environment without it ran its services
 * as production, with nothing to say so. The deploy now derives NODE_ENV from the resolved
 * environment (as clinozy-fe derives VITE_APP_ENV) and stops on a value naming another one.
 */
describe('deploy NODE_ENV (policy)', () => {
  it('derives the environment from the resolved deploy target', () => {
    expect(deployWorkflow).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression syntax, asserted verbatim
      'ENVIRONMENT: ${{ needs.resolve-environment.outputs.environment }}',
    );
  });

  it('stops on a GitHub Environment NODE_ENV that names another environment', () => {
    const guard = deployWorkflow.indexOf('- name: Derive NODE_ENV from the deploy environment');
    const exportStep = deployWorkflow.indexOf('- name: Export GitHub Environment to runner');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(exportStep);
    const step = deployWorkflow.slice(guard, exportStep);
    expect(step).toContain('\'($vars + $secrets).NODE_ENV // ""\'');
    expect(step).toContain('if [ -n "$configured" ] && [ "$configured" != "$ENVIRONMENT" ]; then');
    expect(step).toContain('exit 1');
  });

  it('sets NODE_ENV to the target in both mirrors — to the runner and to Railway', () => {
    const merge = "'($vars + $secrets + {NODE_ENV: $environment})";
    expect(deployWorkflow.split(merge)).toHaveLength(3);
    expect(deployWorkflow.split('--arg environment "$ENVIRONMENT"')).toHaveLength(3);
    // No mirror may still copy the GitHub Environment without the derived NODE_ENV.
    expect(deployWorkflow).not.toContain("'($vars + $secrets)\n");
  });
});
