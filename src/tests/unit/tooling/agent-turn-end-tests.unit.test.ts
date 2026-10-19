import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitEnvironmentWithoutInheritedRepository } from '@tooling/setup/common/git-environment.js';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_SLUG } from '@/shared/constants/project-identity.constants.js';

const HOOK = join(process.cwd(), 'agent-os', 'hooks', 'be-turn-end-tests.mjs');
/** The hook's state folder under TMPDIR. */
const HOOK_STATE = `${PROJECT_SLUG}-hooks`;
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * A repository with one uncommitted source file and stub `tsx` (the selection: one unit test) and
 * `vitest` (exits with `VITEST_STUB_EXIT`, counts its runs) — the hook's whole world.
 */
function repository(): { root: string; state: string; runs: string } {
  const root = mkdtempSync(join(tmpdir(), 'turn-end-tests-'));
  const state = mkdtempSync(join(tmpdir(), 'turn-end-tests-state-'));
  temporaryDirectories.push(root, state);
  // Run from a git hook (pre-push), the inherited GIT_DIR would outrank `cwd` and these calls
  // would rewrite the hook's own repository — its config and the checked-out branch.
  const git = (...args: string[]) =>
    spawnSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: gitEnvironmentWithoutInheritedRepository(),
    });
  git('init', '--quiet');
  git('config', 'user.email', 'hook@example.com');
  git('config', 'user.name', 'hook');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'init');
  writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 2;\n');

  const bin = join(root, 'node_modules', '.bin');
  mkdirSync(bin, { recursive: true });
  const selection = JSON.stringify({
    mode: 'selected',
    reasons: [],
    projects: { unit: ['src/a.unit.test.ts'], integration: ['src/a.integration.test.ts'] },
    why: {},
  });
  writeFileSync(join(bin, 'tsx'), `#!/usr/bin/env bash\necho '${selection}'\n`);
  const runs = join(state, 'vitest-runs');
  writeFileSync(
    join(bin, 'vitest'),
    `#!/usr/bin/env bash\necho "$*" >> "${runs}"\nprintf '\\033[41m FAIL \\033[49m src/a.unit.test.ts > a is two\\n'\nexit "\${VITEST_STUB_EXIT:-0}"\n`,
  );
  chmodSync(join(bin, 'tsx'), 0o755);
  chmodSync(join(bin, 'vitest'), 0o755);
  return { root, state, runs };
}

function runHook(options: { root: string; state: string; exitCode?: number }) {
  return spawnSync('node', [HOOK], {
    input: JSON.stringify({ session_id: 's', hook_event_name: 'Stop' }),
    encoding: 'utf8',
    env: {
      ...gitEnvironmentWithoutInheritedRepository(),
      CLAUDE_PROJECT_DIR: options.root,
      TMPDIR: options.state,
      VITEST_STUB_EXIT: String(options.exitCode ?? 0),
    },
  });
}

function runCount(runs: string): number {
  return existsSync(runs) ? readFileSync(runs, 'utf8').trim().split('\n').length : 0;
}

/**
 * Locks in the turn-end test hook: it runs only the unit-level files of the
 * selection, a failure exits 2 (asyncRewake wakes the model with the failing tests), a passed
 * tree is not run again, and a live run's lock makes the next one skip.
 */
describe('be-turn-end-tests.mjs', () => {
  it('runs the unit-level files only and wakes the model on a failure', () => {
    const { root, state, runs } = repository();
    const result = runHook({ root, state, exitCode: 1 });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(' FAIL  src/a.unit.test.ts > a is two');
    expect(result.stderr.includes('\u001b')).toBe(false);
    expect(readFileSync(runs, 'utf8')).toContain('run --project unit src/a.unit.test.ts');
    expect(readFileSync(runs, 'utf8')).not.toContain('integration');
  });

  it('remembers a passed tree, and runs again once the tree changes', () => {
    const { root, state, runs } = repository();
    expect(runHook({ root, state }).status).toBe(0);
    expect(runHook({ root, state }).status).toBe(0);
    expect(runCount(runs)).toBe(1);
    writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 3;\n');
    expect(runHook({ root, state }).status).toBe(0);
    expect(runCount(runs)).toBe(2);
  });

  it('skips while another run holds the lock', () => {
    const { root, state, runs } = repository();
    mkdirSync(join(state, HOOK_STATE), { recursive: true });
    writeFileSync(join(state, HOOK_STATE, 'be-turn-end-tests.lock'), String(process.pid));
    expect(runHook({ root, state, exitCode: 1 }).status).toBe(0);
    expect(runCount(runs)).toBe(0);
  });
});
