import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const permissions = (
  JSON.parse(readFileSync('agent-os/platforms/claude/settings.json', 'utf8')) as {
    permissions: Partial<Record<'ask', string[]>> & Record<'allow' | 'deny', string[]>;
  }
).permissions;

/**
 * Locks in the agent permission rules: the chain commands run without a prompt, GitHub stays
 * read-only without one, the destructive commands are denied outright, and nothing asks — neither
 * an `ask` rule nor a hook — so every other call is the permission mode's to decide.
 */
describe('Claude Code permission rules', () => {
  it('the chain commands run without a prompt', () => {
    for (const rule of [
      'Bash(pnpm iteration*)',
      'Bash(pnpm db*)',
      'Bash(git add *)',
      'Bash(git commit *)',
      'Bash(git push *)',
      'Bash(git switch *)',
      'Bash(gh run *)',
      // The project's own server (`.mcp.json`) and the user-level one (`headroom mcp install`).
      'mcp__be-headroom__*',
      'mcp__headroom__*',
    ]) {
      expect(permissions.allow).toContain(rule);
    }
  });

  it('GitHub MCP tools are allowed for reading only', () => {
    const github = permissions.allow.filter((rule) => rule.startsWith('mcp__github__'));
    expect(github.length).toBeGreaterThan(0);
    for (const rule of github) {
      expect(rule).toMatch(
        /^mcp__github__(get_\*|list_\*|search_\*|pull_request_read|issue_read|actions_get|actions_list)$/,
      );
    }
  });

  it('declares no ask rule, the same as clinozy-fe', () => {
    // One policy for both repositories (tests/ci/agent-permissions.policy.test.ts there): a session
    // that holds both merges their rules, and an ask outranks every allow.
    expect(permissions.ask ?? []).toEqual([]);
    // `pnpm exec` runs a binary already installed (a single Vitest file, tsx): no prompt.
    expect(permissions.allow).toContain('Bash(pnpm exec *)');
  });

  it('no hook script asks the user (permissionDecision "ask")', () => {
    const hooksDirectory = join('agent-os', 'hooks');
    for (const file of readdirSync(hooksDirectory).filter((name) => name.endsWith('.mjs'))) {
      const source = readFileSync(join(hooksDirectory, file), 'utf8');
      expect(source, file).not.toMatch(/decision:\s*["']ask["']|decide\(\s*["']ask["']/);
    }
  });

  it('destructive commands are denied', () => {
    for (const rule of ['Bash(git push --force *)', 'Bash(git push -f *)', 'Bash(rm -rf *)']) {
      expect(permissions.deny).toContain(rule);
    }
  });

  it('no rule sits in two lists', () => {
    const all = [...permissions.allow, ...(permissions.ask ?? []), ...permissions.deny];
    expect(new Set(all).size).toBe(all.length);
  });
});
