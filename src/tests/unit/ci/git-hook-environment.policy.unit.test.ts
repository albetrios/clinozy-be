import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  gitEnvironmentWithoutInheritedRepository,
  INHERITED_GIT_REPOSITORY_VARIABLES,
} from '@tooling/setup/common/git-environment.js';

/**
 * Git exports GIT_DIR and friends into every hook it runs, and the hook's whole process tree
 * inherits them. They outrank `cwd`, so a directory-scoped `git` call in tooling silently answers
 * for the hook's repository instead — reading the wrong tree, or, for a write, overwriting the
 * developer's index with a throwaway fixture's contents.
 *
 * Two rules:
 *
 * - `tooling/` and `src/scripts/` start git only through the one module, `git` / `tryGit` in
 *   `tooling/setup/common/git-environment.ts`, which always sheds them. The documented exception
 *   is the pre-commit steps that read the commit's own index (a temporary one for
 *   `git commit <paths>`) through the inherited GIT_INDEX_FILE — {@link PRE_COMMIT_INDEX_READERS}.
 * - `src/tests/` strips them on every git call: a test that builds a throwaway repository runs
 *   inside the pre-push hook too, and there its `git init` / `git config` / `git update-ref`
 *   rewrite the developer's repository (19 Oct 2026: a linked worktree's push set `core.bare`, an
 *   identity and `origin/main` on the shared repository).
 */
const ROOT = process.cwd();
const MODULE_ONLY_ROOTS = [join(ROOT, 'tooling'), join(ROOT, 'src', 'scripts')];
const STRIPPED_ROOTS = [join(ROOT, 'src', 'tests')];
const HELPER_FILE = 'tooling/setup/common/git-environment.ts';
const HELPER_NAME = 'gitEnvironmentWithoutInheritedRepository';

/** The pre-commit steps that read the commit's own index on purpose. */
const PRE_COMMIT_INDEX_READERS: readonly string[] = [
  'src/scripts/tooling/run-pre-commit-guard.ts',
  'src/scripts/validators/migration/lint-rls-policies.ts',
  'src/scripts/validators/routes/validate-route-access-diff.ts',
];

/** Test files known to start git — pins the scan against a regex that quietly stops matching. */
const KNOWN_TEST_GIT_CALLERS: readonly string[] = [
  'src/tests/helpers/iteration-repository.helper.ts',
  'src/tests/unit/tooling/agent-push-review-gate.unit.test.ts',
];

/** A child-process call whose command is `git` (the literal may sit on the next line). */
const GIT_CHILD_PROCESS =
  /\b(?:spawnSync|spawn|execFileSync|execFile|execSync)\(\s*(['"`])git[\s'"`]/;

function collectSourceFiles(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') collectSourceFiles(absolutePath, collected);
    } else if (/\.(?:ts|mts|mjs)$/.test(entry.name)) collected.push(absolutePath);
  }
  return collected;
}

/** The files under `roots` that start git themselves. */
function gitCallers(roots: readonly string[]): string[] {
  return roots
    .flatMap((root) => collectSourceFiles(root))
    .filter((absolutePath) => GIT_CHILD_PROCESS.test(readFileSync(absolutePath, 'utf-8')))
    .map((absolutePath) => relative(ROOT, absolutePath));
}

describe('git hook environment — inherited repository variables', () => {
  it('pins the variables git exports into a hook', () => {
    // Pinned as an exact set: dropping one is invisible end-to-end, because a leaked
    // GIT_INDEX_FILE makes the fixture's write and the gate's read land in the same wrong
    // place, and the two errors cancel.
    expect([...INHERITED_GIT_REPOSITORY_VARIABLES]).toEqual([
      'GIT_DIR',
      'GIT_INDEX_FILE',
      'GIT_WORK_TREE',
      'GIT_PREFIX',
      'GIT_OBJECT_DIRECTORY',
      'GIT_COMMON_DIR',
      'GIT_NAMESPACE',
    ]);
  });

  it('removes every pinned variable and passes the rest through', () => {
    const restore = new Map(
      INHERITED_GIT_REPOSITORY_VARIABLES.map((variable) => [variable, process.env[variable]]),
    );
    try {
      for (const variable of INHERITED_GIT_REPOSITORY_VARIABLES) {
        process.env[variable] = `/somewhere/else/${variable}`;
      }
      const environment = gitEnvironmentWithoutInheritedRepository();

      for (const variable of INHERITED_GIT_REPOSITORY_VARIABLES) {
        expect(
          environment[variable],
          `${variable} must not reach the child process`,
        ).toBeUndefined();
        // PATH, credential helpers and proxy settings have to survive, so the strip is
        // surgical — never a blank environment.
        expect(process.env[variable], `${variable} must not be mutated in-process`).toBe(
          `/somewhere/else/${variable}`,
        );
      }
      expect(environment.PATH).toBe(process.env.PATH);
    } finally {
      for (const [variable, value] of restore) {
        if (value === undefined) delete process.env[variable];
        else process.env[variable] = value;
      }
    }
  });

  it('starts git in tooling and scripts only through the one git module', () => {
    const callers = gitCallers(MODULE_ONLY_ROOTS);
    // Anti-vacuity: the exceptions are found, so an empty scan cannot pass for free.
    expect(callers).toEqual(expect.arrayContaining([...PRE_COMMIT_INDEX_READERS]));
    expect(
      callers.filter((path) => path !== HELPER_FILE && !PRE_COMMIT_INDEX_READERS.includes(path)),
    ).toEqual([]);
  });

  it('marks each pre-commit index reader as the documented exception in place', () => {
    for (const path of PRE_COMMIT_INDEX_READERS) {
      expect(readFileSync(join(ROOT, path), 'utf-8'), path).toContain(
        'The documented exception to the shared git module',
      );
    }
  });

  it('strips the inherited repository in every test file that starts git', () => {
    const callers = gitCallers(STRIPPED_ROOTS);
    expect(callers).toEqual(expect.arrayContaining([...KNOWN_TEST_GIT_CALLERS]));
    const unguarded = callers.filter(
      (path) => !readFileSync(join(ROOT, path), 'utf-8').includes(HELPER_NAME),
    );
    expect(unguarded).toEqual([]);
  });
});
