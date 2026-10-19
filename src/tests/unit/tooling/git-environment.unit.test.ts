import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createTestGitRepository,
  removeScratchFolders,
  runTestGit,
} from '@/tests/helpers/git-repository.helper.js';
import { git, resolveBase, trunkBranch, tryGit } from '@tooling/setup/common/git-environment.js';

/** A throwaway repository with one commit of `a.txt` (built with the inherited repository shed). */
function repository(): string {
  return createTestGitRepository({
    prefix: 'git-environment-',
    branch: 'work',
    files: { 'a.txt': 'one\n' },
  });
}

afterEach(removeScratchFolders);

describe('git', () => {
  it('drops the trailing newline only, so the porcelain status column survives', () => {
    const cwd = repository();
    writeFileSync(join(cwd, 'a.txt'), 'two\n');
    expect(git({ args: ['status', '--porcelain'], cwd })).toBe(' M a.txt');
  });

  it('throws naming the command when git fails', () => {
    const cwd = repository();
    expect(() => git({ args: ['rev-parse', 'no-such-ref'], cwd })).toThrow(
      /^git rev-parse no-such-ref: /,
    );
  });

  it('answers for `cwd` even when a hook pinned another repository', () => {
    const cwd = repository();
    const other = repository();
    const before = process.env.GIT_DIR;
    process.env.GIT_DIR = join(other, '.git');
    try {
      expect(git({ args: ['rev-parse', '--show-toplevel'], cwd })).toBe(cwd);
    } finally {
      if (before === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = before;
    }
  });

  it('passes `input` to standard input', () => {
    const cwd = repository();
    writeFileSync(join(cwd, '.gitignore'), 'ignored.md\n');
    expect(git({ args: ['check-ignore', '--stdin'], cwd, input: 'ignored.md\nkept.md\n' })).toBe(
      'ignored.md',
    );
  });
});

describe('tryGit', () => {
  it('reports a failure instead of throwing', () => {
    const cwd = repository();
    expect(tryGit({ args: ['rev-parse', 'no-such-ref'], cwd }).ok).toBe(false);
  });

  it('keeps the output of a command that exits non-zero with an answer', () => {
    const cwd = repository();
    writeFileSync(join(cwd, 'b.txt'), 'other\n');
    const diff = tryGit({ args: ['diff', '--no-index', '--', 'a.txt', 'b.txt'], cwd });
    expect(diff.ok).toBe(false);
    expect(diff.output).toContain('+other');
  });
});

describe('resolveBase', () => {
  it('returns the given base', () => {
    expect(resolveBase({ base: 'origin/release', cwd: repository() })).toBe('origin/release');
  });

  it('falls back to origin/<trunk> without an upstream', () => {
    expect(resolveBase({ cwd: repository() })).toBe(`origin/${trunkBranch()}`);
  });

  it('prefers the upstream when the branch has one', () => {
    const cwd = repository();
    const run = (gitArguments: string[]) => runTestGit({ repositoryRoot: cwd, gitArguments });
    run(['remote', 'add', 'origin', cwd]);
    run(['update-ref', 'refs/remotes/origin/work', 'HEAD']);
    run(['config', 'branch.work.remote', 'origin']);
    run(['config', 'branch.work.merge', 'refs/heads/work']);
    expect(resolveBase({ cwd })).toBe('origin/work');
    // A local copy of a pull-request check skips the upstream, as the pull request does.
    expect(resolveBase({ cwd, from: 'trunk' })).toBe(`origin/${trunkBranch()}`);
    expect(resolveBase({ base: 'given', cwd, from: 'trunk' })).toBe('given');
  });

  it('measures the local copies of a pull-request check from the trunk', () => {
    for (const path of [
      'tooling/ci/check-patch-coverage.mjs',
      'tooling/iterations/check-iteration-freeze.ts',
      'tooling/vitest/selector-misses.ts',
    ]) {
      expect(readFileSync(path, 'utf8'), path).toContain("from: 'trunk'");
    }
  });
});
