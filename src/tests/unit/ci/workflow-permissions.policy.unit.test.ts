import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// H-14: least privilege for the run's GITHUB_TOKEN. Every workflow states a top-level
// `permissions:` block (without one the token gets the repository's default, which may be
// read-write everywhere), and that block grants no write scope: a job that needs to write states
// it in its own `permissions:`, so the grant reaches that job alone. clinozy-fe pins the same in
// tests/ci/workflow-permissions.policy.test.ts.

const WORKFLOWS_DIR = join(process.cwd(), '.github/workflows');
const workflows = readdirSync(WORKFLOWS_DIR)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({ file, content: readFileSync(join(WORKFLOWS_DIR, file), 'utf8') }));

/** The top-level `permissions:` block: its own line plus the indented lines under it. */
function topLevelPermissions(workflow: string): string | undefined {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line.startsWith('permissions:'));
  if (start === -1) return undefined;
  const block = [lines[start] ?? ''];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && !line.startsWith(' ') && !line.startsWith('#')) break;
    block.push(line);
  }
  return block.filter((line) => !line.trimStart().startsWith('#')).join('\n');
}

describe('workflow token permissions (H-14)', () => {
  it('finds the workflows (parser sanity)', () => {
    expect(workflows.length).toBeGreaterThan(10);
    expect(topLevelPermissions('permissions:\n  contents: read\n\nenv:\n  A: b\n')).toBe(
      'permissions:\n  contents: read\n',
    );
  });

  it.each(workflows.map(({ file, content }) => [file, content]))(
    '%s states a top-level permissions block',
    (_file, content) => {
      expect(topLevelPermissions(content)).toBeDefined();
    },
  );

  it.each(workflows.map(({ file, content }) => [file, content]))(
    '%s grants no write scope workflow-wide',
    (_file, content) => {
      const block = topLevelPermissions(content) ?? '';
      expect(block).not.toMatch(/:\s*write\b/);
      expect(block).not.toMatch(/write-all/);
    },
  );
});
