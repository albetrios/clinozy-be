import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  createScratchFolder,
  createTestGitRepository,
  removeScratchFolders,
  runTestGit,
} from '@/tests/helpers/git-repository.helper.js';
import { gitEnvironmentWithoutInheritedRepository } from '@tooling/setup/common/git-environment.js';
import { afterEach, describe, expect, it } from 'vitest';

const GUARDRAILS = join(process.cwd(), 'agent-os', 'hooks', 'be-guardrails.mjs');
const REVIEW_MARKER = join(process.cwd(), 'tooling', 'agent-os', 'review-marker.ts');
const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
afterEach(removeScratchFolders);

/** A repository whose branch commits `changedFile` on top of `origin/main`. */
function repository(changedFile: string): string {
  const root = createTestGitRepository({
    prefix: 'push-review-gate-',
    branch: 'main',
    files: { 'README.md': '# fixture\n' },
  });
  const git = (...gitArguments: string[]) => runTestGit({ repositoryRoot: root, gitArguments });
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
    env: { ...gitEnvironmentWithoutInheritedRepository(), CLAUDE_PROJECT_DIR: options.root },
  });
  const output = result.stdout.trim();
  if (!output.startsWith('{')) return '';
  const parsed = JSON.parse(output) as {
    hookSpecificOutput?: { permissionDecision?: string };
    systemMessage?: string;
  };
  if (parsed.hookSpecificOutput?.permissionDecision) {
    return parsed.hookSpecificOutput.permissionDecision;
  }
  return parsed.systemMessage?.includes('push review gate') ? 'warn' : '';
}

/**
 * Locks in the push review gate: an agent push of auth, RLS, billing, migration or route changes
 * warns until /be-pre-merge-review records a clean result for HEAD, and never asks the user;
 * other pushes, and pushes in another repository, go through silently.
 */
describe('be-guardrails.mjs push review gate', () => {
  it('warns on pushing an unreviewed auth change, not after a clean review of HEAD', () => {
    const root = repository('src/domains/auth/auth.service.ts');
    expect(decision({ root, command: 'git push -u origin feat/change' })).toBe('warn');
    const recorded = spawnSync(
      TSX,
      ['--tsconfig', join(process.cwd(), 'tsconfig.json'), REVIEW_MARKER, '--note', 'clean'],
      {
        cwd: root,
        encoding: 'utf8',
        env: gitEnvironmentWithoutInheritedRepository(),
      },
    );
    expect(recorded.status).toBe(0);
    expect(decision({ root, command: 'git push -u origin feat/change' })).toBe('');
  });

  it('warns for migrations and routes too, and lets a docs-only push through', () => {
    expect(
      decision({ root: repository('migrations/20261017000000_x.sql'), command: 'git push' }),
    ).toBe('warn');
    expect(
      decision({
        root: repository('src/domains/app/sub-domains/leads/leads.routes.ts'),
        command: 'git push',
      }),
    ).toBe('warn');
    expect(decision({ root: repository('docs/reference/commands.md'), command: 'git push' })).toBe(
      '',
    );
  });

  it('judges only pushes in its own repository', () => {
    const root = repository('src/domains/billing/billing.service.ts');
    const elsewhere = createScratchFolder('push-review-elsewhere-');
    expect(decision({ root, command: `cd ${elsewhere} && git push` })).toBe('');
    expect(decision({ root, command: `git -C ${elsewhere} push` })).toBe('');
  });
});
