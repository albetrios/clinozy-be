import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_SLUG } from '@/shared/constants/project-identity.constants.js';

const HOOKS = 'agent-os/hooks';
const HELPER = '_be-hook.mjs';
/** The hooks' state directory under TMPDIR. */
const HOOK_STATE = `${PROJECT_SLUG}-hooks`;
const manifest = JSON.parse(readFileSync(join(HOOKS, 'hooks.json'), 'utf8')) as {
  hooks: Array<{ id: string; runtime?: unknown; script: string }>;
};
const scripts = readdirSync(HOOKS).filter((name) => /\.(?:mjs|sh)$/.test(name));
const source = (name: string) => readFileSync(join(HOOKS, name), 'utf8');
/** The hook scripts with the comments dropped, so prose about a rule never counts as code. */
const code = (name: string) =>
  source(name)
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '');

/**
 * Locks in one hook runtime, as in clinozy-fe: every hook is a Node `.mjs` script built on
 * `_be-hook.mjs`, which alone reads the payload from stdin, finds the repository root and names
 * the state directory — so no hook needs bash or jq, and no two hooks read the payload or judge
 * "this repository" differently.
 */
describe('agent hook runtime', () => {
  it('wires every hook as a node script', () => {
    expect(manifest.hooks.length).toBeGreaterThanOrEqual(15);
    for (const hook of manifest.hooks) {
      expect(
        hook.runtime,
        `${hook.id}: no runtime field — every hook runs with node`,
      ).toBeUndefined();
      expect(hook.script, hook.id).toMatch(/^be-[a-z-]+\.mjs$/);
      expect(scripts, hook.id).toContain(hook.script);
    }
  });

  it('keeps no bash hook or helper', () => {
    expect(scripts.filter((name) => name.endsWith('.sh'))).toEqual([]);
  });

  it('reads stdin, finds the root and names the state directory only in the helper', () => {
    const others = scripts.filter((name) => name !== HELPER);
    expect(others.length).toBeGreaterThanOrEqual(15);
    for (const name of others) {
      expect(code(name), name).not.toMatch(/readFileSync\(0\b|process\.stdin/);
      expect(code(name), name).not.toContain('CLAUDE_PROJECT_DIR');
      expect(code(name), name).not.toContain(HOOK_STATE);
      expect(code(name), name).not.toMatch(/\bjq\b/);
    }
    // Anti-vacuity: the helper really does the three jobs.
    expect(code(HELPER)).toContain('readFileSync(0');
    expect(code(HELPER)).toContain('CLAUDE_PROJECT_DIR');
    expect(code(HELPER)).toContain(HOOK_STATE);
  });

  it('builds every registered hook on the helper', () => {
    for (const hook of manifest.hooks) {
      expect(code(hook.script), hook.script).toMatch(/from "\.\/_be-hook\.mjs"/);
    }
  });
});
