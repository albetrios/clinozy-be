/**
 * Throwaway git repositories for the design-iteration tooling tests (`tooling/iterations/`).
 *
 * Each repository lives under the OS temp folder with its own `user.name`, a `package.json` and
 * one initial commit on the configured base branch; `removeIterationRepositories` deletes them.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type IterationReadmeFields,
  intakeHash,
  renderIterationReadme,
  resolveIntakeSnapshot,
  schemaRoutesHash,
} from '@tooling/iterations/iteration.util.js';
import { resolveGitMetadata } from '@tooling/setup/codegen/project-identity.util.js';
import { loadConfig } from '@tooling/setup/common/config.js';
import { gitEnvironmentWithoutInheritedRepository } from '@tooling/setup/common/git-environment.js';

/** The trunk the tooling compares against, from the setup manifest. */
export const ITERATION_TEST_BASE_BRANCH = resolveGitMetadata(loadConfig()).defaultBranch;

/** `git config user.name` in every test repository. */
export const ITERATION_TEST_OWNER = 'Test Owner';

/** The fixed "today" the tests pass to the tooling. */
export const ITERATION_TEST_TODAY = '2026-10-01';

const scratchFolders: string[] = [];

/** Runs git in a test repository with inherited hook variables removed. */
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

/** Creates an empty temporary folder that {@link removeIterationRepositories} deletes. */
export function createScratchFolder(prefix: string): string {
  const folder = mkdtempSync(join(tmpdir(), prefix));
  scratchFolders.push(folder);
  return folder;
}

/** Creates a git repository with a `package.json` named `packageName` and one commit. */
export function createIterationRepository(packageName = 'demo-be'): string {
  const repositoryRoot = createScratchFolder('iteration-repository-');
  runTestGit({ repositoryRoot, gitArguments: ['init', '-q', '-b', ITERATION_TEST_BASE_BRANCH] });
  runTestGit({ repositoryRoot, gitArguments: ['config', 'user.name', ITERATION_TEST_OWNER] });
  runTestGit({ repositoryRoot, gitArguments: ['config', 'user.email', 'owner@example.test'] });
  runTestGit({ repositoryRoot, gitArguments: ['config', 'commit.gpgsign', 'false'] });
  writeFileSync(join(repositoryRoot, 'package.json'), JSON.stringify({ name: packageName }));
  runTestGit({ repositoryRoot, gitArguments: ['add', '-A'] });
  runTestGit({ repositoryRoot, gitArguments: ['commit', '-q', '-m', 'initial'] });
  return repositoryRoot;
}

/**
 * Writes an iteration folder with a full README (the field values default to a planning launch).
 * `intake` files go into `intake-files/`; with `recordIntake`, the README records them the way an
 * intake would — Intake mode (`full` unless given), note, and the Schema-routes and Intake hash of
 * the resolved snapshot (an overlay or a brief laid over its Baseline's) — so the gate passes.
 */
export function addTestIteration(iteration: {
  readonly repositoryRoot: string;
  readonly name: string;
  readonly fields?: Partial<IterationReadmeFields>;
  readonly history?: readonly string[];
  readonly intake?: Readonly<Record<string, string>>;
  readonly recordIntake?: boolean;
}): string {
  const folder = join(iteration.repositoryRoot, 'iterations', iteration.name);
  mkdirSync(folder, { recursive: true });
  const fields: IterationReadmeFields = {
    type: 'launch',
    topic: '—',
    owner: ITERATION_TEST_OWNER,
    opened: '2026-09-30',
    branch: ITERATION_TEST_BASE_BRANCH,
    baseline: 'none',
    status: 'planning',
    summary: '—',
    dropPlaced: '—',
    dropSource: '—',
    intakeMode: '—',
    intakeNote: '—',
    schemaRoutes: '—',
    intakeHash: '—',
    ...iteration.fields,
  };
  for (const [name, content] of Object.entries(iteration.intake ?? {})) {
    mkdirSync(join(folder, 'intake-files'), { recursive: true });
    writeFileSync(join(folder, 'intake-files', name), content);
  }
  const history =
    iteration.history === undefined || iteration.history.length === 0
      ? ''
      : `\n## History\n\n${iteration.history.join('\n')}\n`;
  const writeReadme = (values: IterationReadmeFields): void => {
    writeFileSync(
      join(folder, 'README.md'),
      `${renderIterationReadme({ name: iteration.name, fields: values })}${history}`,
    );
  };
  if (!iteration.recordIntake) {
    writeReadme(fields);
    return folder;
  }
  const withMode: IterationReadmeFields = {
    ...fields,
    intakeMode: iteration.fields?.intakeMode ?? 'full',
    intakeNote:
      iteration.fields?.intakeNote ?? `${Object.keys(iteration.intake ?? {}).length} received`,
  };
  writeReadme(withMode);
  const resolved = resolveIntakeSnapshot({
    repositoryRoot: iteration.repositoryRoot,
    iteration: iteration.name,
  });
  writeReadme({
    ...withMode,
    schemaRoutes: schemaRoutesHash(resolved.files.get('schema-routes.md')),
    intakeHash: intakeHash(resolved.files),
  });
  return folder;
}

/** Deletes every repository and folder the helpers created (call from `afterEach`). */
export function removeIterationRepositories(): void {
  for (const folder of scratchFolders.splice(0)) rmSync(folder, { recursive: true, force: true });
}
