import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const permissions = (
  JSON.parse(readFileSync('agent-os/platforms/claude/settings.json', 'utf8')) as {
    permissions: Partial<Record<'ask', string[]>> & Record<'allow' | 'deny', string[]>;
  }
).permissions;

/**
 * Locks in the agent permission rules: the chain commands run without a prompt (`pnpm exec` only
 * for a named dev binary), GitHub stays read-only without one, the destructive commands are denied
 * outright, and the two that publish — `git push` and a merge — ask (H-6). No hook asks; every
 * other call is the permission mode's to decide. clinozy-fe pins its own in
 * tests/ci/agent-permissions.policy.test.ts.
 */
describe('Claude Code permission rules', () => {
  it('the chain commands and local git writes run without a prompt', () => {
    for (const rule of [
      'Bash(pnpm iteration*)',
      'Bash(pnpm db*)',
      'Bash(git add *)',
      'Bash(git commit *)',
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

  it('names the dev binaries pnpm exec may run, never every binary on PATH (H-6)', () => {
    expect(permissions.allow).not.toContain('Bash(pnpm exec *)');
    for (const rule of permissions.allow.filter((entry) => entry.startsWith('Bash(pnpm exec '))) {
      expect(rule).toMatch(/^Bash\(pnpm exec [a-z][a-z0-9-]* \*\)$/);
    }
    const covered = (command: string) =>
      permissions.allow.some((rule) => {
        const body = rule.slice('Bash('.length, -1);
        return body.endsWith('*') ? command.startsWith(body.slice(0, -1)) : command === body;
      });
    for (const command of [
      'pnpm exec tsx -e "anything"',
      'pnpm exec drizzle-kit push',
      'pnpm exec rm -rf dist',
    ]) {
      expect(covered(command), command).toBe(false);
    }
    expect(covered('pnpm exec vitest run src/x.unit.test.ts')).toBe(true);
    expect(covered('pnpm exec biome check src')).toBe(true);
  });

  it('asks before a push or a merge, the same as clinozy-fe (H-6)', () => {
    // One policy for both repositories: a session that holds both merges their rules, and an ask
    // outranks every allow (`Bash(gh pr*)` reads PRs without a prompt; a merge asks).
    expect(permissions.ask).toEqual([
      'Bash(git push)',
      'Bash(git push *)',
      'Bash(gh pr merge*)',
      'mcp__github__merge_pull_request',
    ]);
    expect(permissions.allow.filter((rule) => rule.startsWith('Bash(git push'))).toEqual([]);
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
