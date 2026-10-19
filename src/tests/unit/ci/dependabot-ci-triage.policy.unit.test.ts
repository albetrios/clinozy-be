import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

describe('dependabot CI triage policy', () => {
  it('does not auto-merge; opens an issue when PR CI fails on a Dependabot PR and closes it when green', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/dependabot-ci-triage.yml'), 'utf8');
    expect(workflow).toContain('workflow_run:');
    // Quote-agnostic: the formatter owns quote style in workflow YAML.
    expect(workflow).toMatch(/workflows: \[['"]PR CI['"]\]/);
    expect(workflow).toContain('ci-failed-triage');
    expect(workflow).toContain('ci-passed-close');
    // Through the shared action, the one way a workflow reports a failure, linked to the failed run.
    expect(workflow).not.toContain('gh issue create');
    expect(workflow).toMatch(
      /mode: open[\s\S]*run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/,
    );
    expect(workflow).toMatch(/mode: close\n\s+title: 'Dependabot PR blocked by CI: PR #/);
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('gh pr merge');
    expect(workflow).not.toContain('--auto');
  });

  it('does not run main->dev sync automation in post-merge', () => {
    const postMerge = readFileSync(join(ROOT, '.github/workflows/post-merge-ci.yml'), 'utf8');
    expect(postMerge).not.toContain('sync-main-into-dev');
    expect(postMerge).not.toContain('Sync main into dev');
  });
});
