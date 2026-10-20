import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync('.gitleaks.toml', 'utf8');
const ignore = readFileSync('.gitleaksignore', 'utf8');
const workflow = readFileSync('.github/workflows/pr-ci.yml', 'utf8');

/**
 * Locks in a secret scan that has rules. A `.gitleaks.toml` with only an allowlist loads no rule,
 * so pre-commit and the PR CI secrets job passed every key from 2 Oct to 20 Oct 2026. The config
 * extends gitleaks' built-in rules, the CI job proves them on a planted key before it scans, and
 * .gitleaksignore holds only fingerprints of old commits (a new finding is marked inline instead).
 */
describe('.gitleaks.toml (the secret scan has rules)', () => {
  it("extends gitleaks' built-in rules", () => {
    expect(config).toMatch(/^\[extend\]\s*\nuseDefault = true$/m);
  });

  it('plants a key and checks the config finds it, before the CI scan', () => {
    const canary = workflow.indexOf('- name: Gitleaks canary (the config finds a planted key)');
    const scan = workflow.indexOf('- name: Gitleaks (secret detection)');
    expect(canary).toBeGreaterThan(-1);
    expect(canary).toBeLessThan(scan);
    expect(workflow.slice(canary, scan)).toContain(
      'gitleaks detect --no-git --source "$canary" --config .gitleaks.toml',
    );
  });

  it('ignores only fingerprints of commits, never a file-and-line entry', () => {
    const entries = ignore
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries)
      expect(entry, entry).toMatch(/^[0-9a-f]{40}:[^:]+:[a-z0-9-]+:\d+$/);
  });
});
