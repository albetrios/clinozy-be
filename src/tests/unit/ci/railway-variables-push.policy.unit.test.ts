import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const deployWorkflow = readFileSync('.github/workflows/reusable-railway-deploy.yml', 'utf8');

/** The `exclude_regex` of the Railway variables step. Bash ERE and JS agree on this pattern. */
function excludeRegex(): RegExp {
  const pattern = /exclude_regex='([^']+)'/.exec(deployWorkflow)?.[1];
  if (!pattern) throw new Error('exclude_regex not found in reusable-railway-deploy.yml');
  return new RegExp(pattern);
}

/**
 * The Railway variables push merges `toJSON(vars)` and `toJSON(secrets)` and sends every key its
 * `exclude_regex` lets through. The secrets context always carries the job's token as
 * `github_token`, in lower case, and the regex named only `GITHUB_TOKEN`: every deploy wrote the
 * token into both Railway services' variables (run 39565294221 listed it among the 91 pushed keys).
 */
describe('Railway variables push (policy)', () => {
  it('never pushes the job token, under either spelling, or a GitHub Actions internal', () => {
    const regex = excludeRegex();
    for (const key of [
      'github_token',
      'GITHUB_TOKEN',
      'RAILWAY_TOKEN',
      'ACTIONS_RUNTIME_TOKEN',
      'CI',
    ]) {
      expect(regex.test(key), key).toBe(true);
    }
  });

  it('still pushes the runtime configuration', () => {
    const regex = excludeRegex();
    for (const key of ['ALLOWED_ORIGINS', 'DATABASE_URL', 'JWT_PRIVATE_KEY', 'NODE_ENV']) {
      expect(regex.test(key), key).toBe(false);
    }
  });

  it('filters the merged secrets with that one regex', () => {
    expect(deployWorkflow.match(/exclude_regex='/g)).toHaveLength(1);
    expect(deployWorkflow).toContain('--argjson secrets "$GH_SECRETS_JSON"');
    expect(deployWorkflow).toContain('if [[ "$key" =~ $exclude_regex ]]; then');
  });
});
