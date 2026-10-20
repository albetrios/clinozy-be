import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createScratchFolder,
  removeScratchFolders,
} from '@/tests/helpers/git-repository.helper.js';

const HOOKS = join(process.cwd(), 'agent-os', 'hooks');

/**
 * Runs one hook and returns its result; throws when the hook process did not run to the end. Both
 * hooks here exit 0 on every path, so a missing answer would otherwise read as "silent": one
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

/** The PR guard's answer for one MCP PR creation in `session`: `ask`, or nothing. */
function prDecision(options: { state: string; session: string }): string {
  const result = runHook({
    script: 'be-no-unrequested-pr.mjs',
    state: options.state,
    payload: {
      session_id: options.session,
      tool_name: 'mcp__github__create_pull_request',
      tool_input: { title: 'feat: x' },
    },
  });
  const output = result.stdout.trim();
  if (output === '') return '';
  return (JSON.parse(output) as { hookSpecificOutput: { permissionDecision: string } })
    .hookSpecificOutput.permissionDecision;
}

afterEach(removeScratchFolders);

/**
 * Locks in that /be-ship and /be-open-pr are the explicit PR request: the turn they start opens
 * its PR without a second confirmation, every other turn still asks, and the next prompt clears it.
 */
describe('be-no-unrequested-pr.mjs honours /be-ship', () => {
  it('asks in an ordinary turn and lets a /be-ship or /be-open-pr turn through', () => {
    const state = createScratchFolder('pr-request-hooks-');
    const prompt = (session: string, text: string) =>
      runHook({
        script: 'be-prompt-skill-router.mjs',
        state,
        payload: { session_id: session, prompt: text },
      });

    prompt('ordinary', 'what does the auth middleware do?');
    expect(prDecision({ state, session: 'ordinary' })).toBe('ask');

    prompt('shipping', '/be-ship feat: invoices');
    expect(prDecision({ state, session: 'shipping' })).toBe('');
    prompt('opening', '  /be-open-pr');
    expect(prDecision({ state, session: 'opening' })).toBe('');

    prompt('shipping', 'thanks — now look at the logs');
    expect(prDecision({ state, session: 'shipping' })).toBe('ask');
    prompt('lookalike', '/be-shipping-notes');
    expect(prDecision({ state, session: 'lookalike' })).toBe('ask');
  });
});
