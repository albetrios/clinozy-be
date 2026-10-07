import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/**
 * Locks in the codegraph auto-sync git hooks: `codegraph sync` is a local,
 * incremental index refresh (no LLM tokens) that must run on the events which
 * change the working tree — branch switches (post-checkout) and merges/pulls
 * (post-merge) — so code-intelligence queries never answer from a stale index.
 * Both must be guarded (no-op when codegraph or the index is absent, e.g. CI /
 * web sessions) and backgrounded (never block the git command).
 */
describe('codegraph auto-sync git hooks policy', () => {
  it('post-checkout refreshes the index on a branch switch — guarded + backgrounded', () => {
    const hook = readFileSync(join(ROOT, '.husky/post-checkout'), 'utf8');
    expect(hook).toContain('codegraph sync');
    // only branch checkouts ($3 == 1), not file checkouts
    expect(hook).toContain('[ "$3" = "1" ]');
    // no-op when codegraph or the index is absent (CI, web sessions)
    expect(hook).toContain('command -v codegraph');
    expect(hook).toContain('.codegraph/codegraph.db');
    // backgrounded so it never blocks the checkout
    expect(hook).toContain('&');
  });

  it('post-merge refreshes the index after a merge/pull — guarded + backgrounded', () => {
    const hook = readFileSync(join(ROOT, '.husky/post-merge'), 'utf8');
    expect(hook).toContain('codegraph sync');
    expect(hook).toContain('command -v codegraph');
    expect(hook).toContain('.codegraph/codegraph.db');
    expect(hook).toContain('&');
  });
});

/**
 * Locks in index-only setup: `codegraph install` builds no index without `--init`
 * and replaces the tracked `.mcp.json` / `.cursor/mcp.json` / `.claude/settings.json`
 * symlinks with plain files, leaving every bootstrap with a dirty tree. Both setup
 * paths build the index with `codegraph init`; the MCP server is declared through
 * the symlink by the default-pair merge.
 */
describe('codegraph setup policy', () => {
  it('the cloud bootstrap builds the index with codegraph init, never codegraph install', () => {
    const script = readFileSync(join(ROOT, 'tooling/setup/agent/install-codegraph.sh'), 'utf8');
    const commands = script
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    expect(commands).toContain('codegraph init');
    expect(commands).not.toContain('codegraph install');
  });

  it('setup:local builds the index with codegraph init, never codegraph install', () => {
    const source = readFileSync(join(ROOT, 'tooling/dev/setup-local.ts'), 'utf8');
    expect(source).toContain("captureCommand('codegraph', ['init'])");
    expect(source).not.toMatch(/captureCommand\(\s*'codegraph',\s*\[\s*'install'/);
  });
});
