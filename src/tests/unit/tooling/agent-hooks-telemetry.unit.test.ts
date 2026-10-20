import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createScratchFolder,
  removeScratchFolders,
} from '@/tests/helpers/git-repository.helper.js';
import { afterEach, describe, expect, it } from 'vitest';

const REPORT = join(process.cwd(), 'tooling', 'agent-os', 'hooks-telemetry.ts');
const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
afterEach(removeScratchFolders);

/** The report's output for a checkout holding only a hooks manifest and these telemetry rows. */
function report(rows: string[]): string {
  const root = createScratchFolder('hooks-telemetry-');
  mkdirSync(join(root, 'agent-os', 'hooks'), { recursive: true });
  writeFileSync(
    join(root, 'agent-os', 'hooks', 'hooks.json'),
    JSON.stringify({ hooks: [{ id: 'be-quiet-hook' }, { id: 'be-busy-hook' }] }),
  );
  writeFileSync(join(root, 'agent-os', 'hooks', '.telemetry.log'), `${rows.join('\n')}\n`);
  const result = spawnSync(TSX, ['--tsconfig', join(process.cwd(), 'tsconfig.json'), REPORT], {
    cwd: root,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

const now = new Date().toISOString();

/**
 * Locks in the hooks report: only a `fired` row counts as a fire, a pruning candidate is listed
 * with why it stayed quiet (the detail column of its silent rows), and an id hooks.json no longer
 * declares is listed apart as retired, not as a candidate.
 */
describe('hooks-telemetry.ts (pnpm agent-os:hooks:report)', () => {
  it('says why a quiet hook stayed quiet, and lists retired ids apart', () => {
    const output = report([
      `${now},be-quiet-hook,PostToolUse,silent,not-a-push`,
      `${now},be-quiet-hook,PostToolUse,silent,not-a-push`,
      `${now},be-quiet-hook,PostToolUse,silent,not-a-push`,
      `${now},be-quiet-hook,PostToolUse,silent,no-gh`,
      `${now},be-busy-hook,Stop,fired,failed`,
      `${now},quiet-hook,PostToolUse,silent`,
    ]);
    expect(output).toContain('be-quiet-hook: not-a-push 3, no-gh 1');
    expect(output).not.toContain('be-busy-hook:');
    expect(output).toContain('retired ids still in the log (not in hooks.json): quiet-hook');
  });
});
