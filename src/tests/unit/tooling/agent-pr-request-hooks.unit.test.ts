import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const HOOKS = join(process.cwd(), 'agent-os', 'hooks');
const temporaryDirectories: string[] = [];

function runHook(options: { script: string; state: string; payload: object }) {
  return spawnSync('bash', [join(HOOKS, options.script)], {
    input: JSON.stringify(options.payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: process.cwd(), TMPDIR: options.state },
  });
}

/** The PR guard's answer for one MCP PR creation in `session`: `ask`, or nothing. */
function prDecision(options: { state: string; session: string }): string {
  const result = runHook({
    script: 'no-unrequested-pr.sh',
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

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * Locks in that /be-ship and /be-open-pr are the explicit PR request: the turn they start opens
 * its PR without a second confirmation, every other turn still asks, and the next prompt clears it.
 */
describe('no-unrequested-pr.sh honours /be-ship', () => {
  it('asks in an ordinary turn and lets a /be-ship or /be-open-pr turn through', () => {
    const state = mkdtempSync(join(tmpdir(), 'pr-request-hooks-'));
    temporaryDirectories.push(state);
    const prompt = (session: string, text: string) =>
      runHook({
        script: 'prompt-skill-router.sh',
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
