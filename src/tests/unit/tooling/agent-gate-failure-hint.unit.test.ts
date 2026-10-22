import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createScratchFolder,
  removeScratchFolders,
} from '@/tests/helpers/git-repository.helper.js';
import { afterEach, describe, expect, it } from 'vitest';

const HOOK = join(process.cwd(), 'agent-os', 'hooks', 'be-gate-failure-hint.mjs');
afterEach(removeScratchFolders);

/** The hook's output for one failed Bash command, and the telemetry row it recorded. */
function failedCommand(command: string) {
  const state = createScratchFolder('gate-failure-hint-');
  const log = join(state, 'telemetry.log');
  const result = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Bash',
      tool_input: { command },
    }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: state, HOOK_TELEMETRY_LOG: log },
  });
  const row = readFileSync(log, 'utf8').trim().split('\n').at(-1) ?? '';
  return { result, telemetry: row.split(',').slice(1).join(',') };
}

/**
 * Locks in the gate-failure hint: a failed gate gets its fix hint and records `fired`; any other
 * failed command stays quiet and records `silent`. The planted-bug drill (20 Oct 2026) swapped the
 * two statuses and no test noticed.
 */
describe('be-gate-failure-hint.mjs', () => {
  it('hints the fix for a failed gate and records fired', () => {
    const { result, telemetry } = failedCommand('pnpm validate:domain:strict');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('domain structure');
    expect(telemetry).toBe('be-gate-failure-hint,PostToolUseFailure,fired');
  });

  it('names --silent when pnpm rejects the -s shorthand', () => {
    const { result, telemetry } = failedCommand('pnpm -s dev:stack:status');
    expect(result.stdout).toContain('pnpm 12 has no -s shorthand → pnpm --silent <script>');
    expect(telemetry).toBe('be-gate-failure-hint,PostToolUseFailure,fired');
    expect(failedCommand('pnpm dev:stack:status --since 5m').result.stdout).toBe('');
  });

  it('stays quiet for an ordinary failed command and records silent', () => {
    const { result, telemetry } = failedCommand('grep -q missing README.md');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(telemetry).toBe('be-gate-failure-hint,PostToolUseFailure,silent');
  });
});
