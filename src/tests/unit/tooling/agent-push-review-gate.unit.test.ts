import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const GUARDRAILS = join(process.cwd(), 'agent-os', 'hooks', 'be-guardrails.mjs');
const REVIEW_MARKER = join(process.cwd(), 'tooling', 'agent-os', 'review-marker.ts');
const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A repository whose branch commits `changedFile` on top of `origin/main`. */
function repository(changedFile: string): string {
  const root = mkdtempSync(join(tmpdir(), 'push-review-gate-'));
  temporaryDirectories.push(root);
  const git = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '--quiet', '--initial-branch', 'main');
  git('config', 'user.email', 'gate@example.com');
  git('config', 'user.name', 'gate');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'init');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('switch', '--quiet', '-c', 'feat/change');
  mkdirSync(dirname(join(root, changedFile)), { recursive: true });
  writeFileSync(join(root, changedFile), 'export const changed = true;\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'change');
  return root;
}

/** The guardrail's decision for `command` run in `root`: `ask`, or "" when it lets it through. */
function decision(options: { root: string; command: string }): string {
  const result = spawnSync('node', [GUARDRAILS], {
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: options.command },
      cwd: options.root,
    }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: options.root },
  });
  const output = result.stdout.trim();
  if (!output.startsWith('{"hookSpecificOutput"')) return '';
  return (JSON.parse(output) as { hookSpecificOutput: { permissionDecision: string } })
    .hookSpecificOutput.permissionDecision;
}

/**
 * Locks in the push review gate: an agent push of auth, RLS, billing, migration or route changes
 * asks the user first until /be-pre-merge-review records a clean result for HEAD; other pushes,
 * and pushes in another repository, go through.
 */
describe('be-guardrails.mjs push review gate', () => {
  it('asks before pushing an unreviewed auth change, not after a clean review of HEAD', () => {
    const root = repository('src/domains/auth/auth.service.ts');
    expect(decision({ root, command: 'git push -u origin feat/change' })).toBe('ask');
    const recorded = spawnSync(
      TSX,
      ['--tsconfig', join(process.cwd(), 'tsconfig.json'), REVIEW_MARKER, '--note', 'clean'],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    expect(recorded.status).toBe(0);
    expect(decision({ root, command: 'git push -u origin feat/change' })).toBe('');
  });

  it('asks for migrations and routes too, and lets a docs-only push through', () => {
    expect(
      decision({ root: repository('migrations/20261017000000_x.sql'), command: 'git push' }),
    ).toBe('ask');
    expect(
      decision({
        root: repository('src/domains/app/sub-domains/leads/leads.routes.ts'),
        command: 'git push',
      }),
    ).toBe('ask');
    expect(decision({ root: repository('docs/reference/commands.md'), command: 'git push' })).toBe(
      '',
    );
  });

  it('judges only pushes in its own repository', () => {
    const root = repository('src/domains/billing/billing.service.ts');
    const elsewhere = mkdtempSync(join(tmpdir(), 'push-review-elsewhere-'));
    temporaryDirectories.push(elsewhere);
    expect(decision({ root, command: `cd ${elsewhere} && git push` })).toBe('');
    expect(decision({ root, command: `git -C ${elsewhere} push` })).toBe('');
  });
});
