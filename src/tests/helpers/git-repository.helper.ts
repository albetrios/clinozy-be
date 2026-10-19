/**
 * The one throwaway git repository for tests: every test that needs a real repository builds it
 * here instead of running `git init` / `git config` / `git commit` by hand.
 *
 * Every git call drops the inherited `GIT_DIR` and friends (`gitEnvironmentWithoutInheritedRepository`):
 * run from a git hook (pre-push), they would outrank `cwd` and re-target the hook's own
 * repository — its index, config and branches. `removeScratchFolders` deletes everything created.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  gitEnvironmentWithoutInheritedRepository,
  trunkBranch,
} from '@tooling/setup/common/git-environment.js';

/** The trunk from the setup manifest — the branch every test repository starts on by default. */
export const TEST_GIT_TRUNK = trunkBranch();

/** `git config user.name` in every test repository. */
export const TEST_GIT_OWNER = 'Test Owner';

const scratchFolders: string[] = [];

/** Runs git in a test repository with the inherited repository variables removed; trimmed stdout. */
export function runTestGit(command: {
  readonly repositoryRoot: string;
  readonly gitArguments: readonly string[];
}): string {
  return execFileSync('git', [...command.gitArguments], {
    cwd: command.repositoryRoot,
    encoding: 'utf-8',
    env: gitEnvironmentWithoutInheritedRepository(),
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Creates an empty temporary folder that {@link removeScratchFolders} deletes.
 *
 * @remarks Returns the real path (macOS's temp folder is a symlink), so it compares equal to what
 * `git rev-parse --show-toplevel` prints.
 */
export function createScratchFolder(prefix: string): string {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  scratchFolders.push(folder);
  return folder;
}

/**
 * Creates a git repository on `branch` (default {@link TEST_GIT_TRUNK}) with its own identity and
 * signing off. With `files` (path → content, relative to the root) they are written and committed
 * as `initial`; without, the repository has no commit.
 */
export function createTestGitRepository(options: {
  readonly prefix: string;
  readonly branch?: string | undefined;
  readonly files?: Readonly<Record<string, string>> | undefined;
}): string {
  const repositoryRoot = createScratchFolder(options.prefix);
  const git = (...gitArguments: string[]): string => runTestGit({ repositoryRoot, gitArguments });
  git('init', '-q', '-b', options.branch ?? TEST_GIT_TRUNK);
  git('config', 'user.name', TEST_GIT_OWNER);
  git('config', 'user.email', 'owner@example.test');
  git('config', 'commit.gpgsign', 'false');
  if (options.files === undefined) return repositoryRoot;
  for (const [path, content] of Object.entries(options.files)) {
    mkdirSync(dirname(join(repositoryRoot, path)), { recursive: true });
    writeFileSync(join(repositoryRoot, path), content);
  }
  git('add', '-A');
  git('commit', '-q', '-m', 'initial');
  return repositoryRoot;
}

/** Deletes every repository and folder the helpers created (call from `afterEach`). */
export function removeScratchFolders(): void {
  for (const folder of scratchFolders.splice(0)) rmSync(folder, { recursive: true, force: true });
}
