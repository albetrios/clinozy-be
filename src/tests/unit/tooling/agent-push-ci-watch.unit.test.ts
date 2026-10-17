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

const HOOK = join(process.cwd(), 'agent-os', 'hooks', 'push-ci-watch.mjs');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A repository with one commit, and a stub `gh` that answers `run list` with `runs`. */
function fixture(options: { runs: object[]; authenticated?: boolean }) {
  const root = mkdtempSync(join(tmpdir(), 'push-ci-watch-'));
  const state = mkdtempSync(join(tmpdir(), 'push-ci-watch-state-'));
  temporaryDirectories.push(root, state);
  const git = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '--quiet');
  git('config', 'user.email', 'watch@example.com');
  git('config', 'user.name', 'watch');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'init');
  const bin = join(state, 'bin');
  mkdirSync(bin);
  const calls = join(state, 'gh-calls');
  writeFileSync(join(state, 'runs.json'), JSON.stringify(options.runs));
  writeFileSync(
    join(bin, 'gh'),
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${calls}"`,
      `if [ "$1" = auth ]; then exit ${options.authenticated === false ? 1 : 0}; fi`,
      `cat "${join(state, 'runs.json')}"`,
    ].join('\n'),
  );
  chmodSync(join(bin, 'gh'), 0o755);
  return { root, state, bin, calls };
}

function runHook(options: { root: string; state: string; bin: string; command?: string }) {
  return spawnSync('node', [HOOK], {
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: options.command ?? 'git push -u origin feat/x' },
      cwd: options.root,
    }),
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: options.root,
      TMPDIR: options.state,
      PATH: `${options.bin}:${process.env.PATH ?? ''}`,
      PUSH_CI_WATCH_POLL_MILLISECONDS: '10',
    },
  });
}

const run = (name: string, conclusion: string) => ({
  databaseId: 1,
  name,
  status: 'completed',
  conclusion,
  url: `https://github.example/runs/${name}`,
});

/**
 * Locks in the push CI watch: a failed run of the pushed commit exits 2 (asyncRewake wakes the
 * model) and asks for be-ci-investigator; a green commit, no authenticated gh, or a push in
 * another repository exits 0.
 */
describe('push-ci-watch.mjs', () => {
  it('wakes the model with each failed run of the pushed commit', () => {
    const watched = fixture({ runs: [run('PR CI', 'failure'), run('Docs lane', 'success')] });
    const result = runHook(watched);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('PR CI: failure — https://github.example/runs/PR CI');
    expect(result.stderr).not.toContain('Docs lane');
    expect(result.stderr).toContain('be-ci-investigator');
  });

  it('stays silent on a green commit and without an authenticated gh', () => {
    expect(runHook(fixture({ runs: [run('PR CI', 'success')] })).status).toBe(0);
    const unauthenticated = fixture({ runs: [run('PR CI', 'failure')], authenticated: false });
    expect(runHook(unauthenticated).status).toBe(0);
    expect(readFileSync(unauthenticated.calls, 'utf8')).not.toContain('run list');
  });

  it('judges only pushes in its own repository', () => {
    const watched = fixture({ runs: [run('PR CI', 'failure')] });
    const elsewhere = mkdtempSync(join(tmpdir(), 'push-ci-elsewhere-'));
    temporaryDirectories.push(elsewhere);
    expect(runHook({ ...watched, command: `cd ${elsewhere} && git push` }).status).toBe(0);
    expect(existsSync(watched.calls)).toBe(false);
  });
});
