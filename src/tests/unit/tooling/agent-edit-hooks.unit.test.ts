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
import { afterEach, describe, expect, it } from 'vitest';

const HOOK = join(process.cwd(), 'agent-os', 'hooks', 'be-edit-hooks.mjs');
const temporaryDirectories: string[] = [];

/** A repository with a stand-in `biome` that records its arguments, one call per line. */
function makeRepository(): { repository: string; state: string; biomeCalls: string } {
  const repository = mkdtempSync(join(tmpdir(), 'edit-hooks-repository-'));
  const state = mkdtempSync(join(tmpdir(), 'edit-hooks-state-'));
  temporaryDirectories.push(repository, state);
  spawnSync('git', ['init', '-q'], { cwd: repository });
  mkdirSync(join(repository, 'src'), { recursive: true });
  mkdirSync(join(repository, 'docs'), { recursive: true });
  writeFileSync(join(repository, 'src', 'first.ts'), 'export const first = 1;\n');
  writeFileSync(join(repository, 'src', 'second.ts'), 'export const second = 2;\n');
  writeFileSync(join(repository, 'docs', 'notes.md'), '# Notes\n');
  const biomeCalls = join(state, 'biome-calls');
  mkdirSync(join(repository, 'node_modules', '.bin'), { recursive: true });
  const biome = join(repository, 'node_modules', '.bin', 'biome');
  writeFileSync(biome, `#!/usr/bin/env bash\necho "$*" >> "${biomeCalls}"\n`);
  chmodSync(biome, 0o755);
  return { repository, state, biomeCalls };
}

function runHook(options: { repository: string; state: string; payload: object }) {
  return spawnSync('node', [HOOK], {
    input: JSON.stringify(options.payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: options.repository, TMPDIR: options.state },
  });
}

const edit = (filePath: string) => ({
  session_id: 'turn',
  hook_event_name: 'PostToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: filePath },
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * Locks in format-once-at-Stop: a turn's edits queue their files, and Stop formats them with one
 * Biome call — each file once, only `pnpm format`'s scope, never another repository's files.
 */
describe('be-edit-hooks.mjs', () => {
  it('formats the files of a turn once, at Stop, with one Biome call', () => {
    const { repository, state, biomeCalls } = makeRepository();
    const first = join(repository, 'src', 'first.ts');
    const second = join(repository, 'src', 'second.ts');
    for (const file of [first, second, first, join(repository, 'docs', 'notes.md')]) {
      expect(runHook({ repository, state, payload: edit(file) }).status).toBe(0);
    }
    runHook({ repository, state, payload: edit('/elsewhere/other-repository/src/x.ts') });
    expect(existsSync(biomeCalls)).toBe(false);

    const stop = runHook({
      repository,
      state,
      payload: { session_id: 'turn', hook_event_name: 'Stop' },
    });
    expect(stop.status).toBe(0);
    expect(readFileSync(biomeCalls, 'utf8')).toBe(`format --write ${first} ${second}\n`);

    runHook({ repository, state, payload: { session_id: 'turn', hook_event_name: 'Stop' } });
    expect(readFileSync(biomeCalls, 'utf8').split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('gives a skill reminder as additionalContext once per turn, and none for another repository', () => {
    const { repository, state } = makeRepository();
    const routes = join(repository, 'src', 'domains', 'x', 'x.routes.ts');
    const reminders = (payload: object) => runHook({ repository, state, payload }).stdout.trim();
    const firstTime = JSON.parse(reminders(edit(routes))) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(firstTime.hookSpecificOutput.additionalContext).toContain('be-route-schema-doc-guard');
    expect(reminders(edit(routes))).toBe('');
    expect(reminders(edit('/elsewhere/other-repository/src/x.routes.ts'))).toBe('');
  });
});
