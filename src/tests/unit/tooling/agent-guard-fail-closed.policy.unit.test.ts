import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// H-6: the destructive-command and secret guard (agent-os/hooks/be-guardrails.mjs) fails CLOSED.
// Claude Code reads exit 2 from a PreToolUse hook as "block the call" and any other non-zero exit
// as a hook error that lets the call through, so a guard that crashed — a payload it could not
// read, a rule module it could not load, a throw while it checked — used to allow the very call
// it was there to judge. clinozy-fe pins its own in tests/ci/agent-guard-fail-closed.policy.test.ts.

const HOOKS = join(process.cwd(), 'agent-os', 'hooks');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Runs the guard from `hooks` with `input` on stdin. */
function runGuard({ input, hooks = HOOKS }: { input: string; hooks?: string }) {
  const state = mkdtempSync(join(tmpdir(), 'be-guard-closed-'));
  temporaryDirectories.push(state);
  return spawnSync(process.execPath, [join(hooks, 'be-guardrails.mjs')], {
    input,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: process.cwd(), TMPDIR: state },
  });
}

describe('be-guardrails fails closed (H-6)', () => {
  it('blocks a call whose payload it cannot read', () => {
    const result = runGuard({ input: 'not json' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('be-guardrails could not check this call, so it is blocked');
  });

  it('blocks a call when it throws while checking', () => {
    // A command that is not a string: the shell rules throw on it.
    const result = runGuard({
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: { not: 'a string' } } }),
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('(the guard fails closed)');
  });

  it('blocks every call when a rule module is missing', () => {
    const hooks = mkdtempSync(join(tmpdir(), 'be-guard-hooks-'));
    temporaryDirectories.push(hooks);
    cpSync(HOOKS, hooks, { recursive: true });
    rmSync(join(hooks, '_be-guard-rules.mjs'));
    const result = runGuard({
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }),
      hooks,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('_be-guard-rules.mjs');
  });

  it('still allows a harmless call and denies a destructive one, exiting 0', () => {
    const harmless = runGuard({
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }),
    });
    expect(harmless.status).toBe(0);
    expect(harmless.stdout).not.toContain('"deny"');
    const destructive = runGuard({
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }),
    });
    expect(destructive.status).toBe(0);
    expect(destructive.stdout).toContain('"permissionDecision":"deny"');
  });
});
