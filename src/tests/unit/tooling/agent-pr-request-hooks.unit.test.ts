import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createScratchFolder,
  removeScratchFolders,
} from '@/tests/helpers/git-repository.helper.js';

const HOOKS = join(process.cwd(), 'agent-os', 'hooks');

/**
 * Runs one hook and returns its result; throws when the hook process did not run to the end. The
 * hook here exits 0 on every path, so a missing answer would otherwise read as "silent": one
 * pre-push run under heavy load (20 Oct 2026) failed with an empty decision and no other trace.
 */
function runHook(options: { script: string; state: string; payload: object }) {
  const result = spawnSync('node', [join(HOOKS, options.script)], {
    input: JSON.stringify(options.payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: process.cwd(), TMPDIR: options.state },
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(
      `${options.script} did not run to the end (status ${result.status}, signal ${result.signal}, ${result.error?.message ?? 'no spawn error'}): ${result.stderr}`,
    );
  }
  return result;
}

afterEach(removeScratchFolders);

/**
 * Locks in that a prompt to drive a PR names this repository's babysit skill — be-pr-babysit, the
 * be- prefixed name, since there is no bare `babysit` or `steward` skill — without a build verb,
 * while an ordinary prompt still produces nothing. clinozy-fe pins the same for fe-pr-babysit.
 */
describe('be-prompt-skill-router.mjs routes a PR to drive to be-pr-babysit', () => {
  it('names be-pr-babysit for babysit / make it green / fix CI, and stays silent otherwise', () => {
    const state = createScratchFolder('pr-babysit-route-');
    const context = (text: string) =>
      runHook({
        script: 'be-prompt-skill-router.mjs',
        state,
        payload: { session_id: 'routing', prompt: text },
      }).stdout;

    for (const text of [
      'yes please create PRs and make it green',
      'babysit the PR',
      'CI is red — fix CI on the PR',
      'watch the PR until it is merge-ready',
    ]) {
      expect(context(text), text).toContain('be-pr-babysit');
    }
    expect(context('what does the auth middleware do?')).toBe('');
    expect(context('make the button green')).not.toContain('be-pr-babysit');
  });
});
