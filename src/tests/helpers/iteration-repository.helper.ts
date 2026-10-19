/**
 * Throwaway git repositories for the design-iteration tooling tests (`tooling/iterations/`).
 *
 * Built on the one test repository fixture (`git-repository.helper.ts`): each has a `package.json`
 * and one initial commit on the trunk; `removeScratchFolders` deletes them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createTestGitRepository,
  TEST_GIT_OWNER,
  TEST_GIT_TRUNK,
} from '@/tests/helpers/git-repository.helper.js';
import {
  type IterationReadmeFields,
  intakeHash,
  renderIterationReadme,
  schemaRoutesHash,
} from '@tooling/iterations/iteration.util.js';

/** The fixed "today" the tests pass to the tooling. */
export const ITERATION_TEST_TODAY = '2026-10-01';

/** Creates a git repository with a `package.json` named `packageName` and one commit. */
export function createIterationRepository(packageName = 'demo-be'): string {
  return createTestGitRepository({
    prefix: 'iteration-repository-',
    files: { 'package.json': JSON.stringify({ name: packageName }) },
  });
}

/**
 * Writes an iteration folder with a full README (the field values default to a planning launch).
 * `intake` files go into `intake-files/`; with `recordIntake`, the README records them the way an
 * intake would — Intake mode (`full` unless given), note, Schema-routes and the Intake hash — so the
 * gate passes.
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
    process: 'full',
    topic: '—',
    owner: TEST_GIT_OWNER,
    opened: '2026-09-30',
    branch: TEST_GIT_TRUNK,
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
  const intakeFolder = join(folder, 'intake-files');
  const recorded: IterationReadmeFields = iteration.recordIntake
    ? {
        ...fields,
        intakeMode: iteration.fields?.intakeMode ?? 'full',
        intakeNote:
          iteration.fields?.intakeNote ?? `${Object.keys(iteration.intake ?? {}).length} received`,
        schemaRoutes: schemaRoutesHash(join(intakeFolder, 'schema-routes.md')),
        intakeHash: intakeHash(intakeFolder),
      }
    : fields;
  const history =
    iteration.history === undefined || iteration.history.length === 0
      ? ''
      : `\n## History\n\n${iteration.history.join('\n')}\n`;
  writeFileSync(
    join(folder, 'README.md'),
    `${renderIterationReadme({ name: iteration.name, fields: recorded })}${history}`,
  );
  return folder;
}
