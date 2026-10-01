/**
 * Design-iteration tooling — `pnpm iteration:intake` (`tooling/iterations/iteration-intake.util.ts`).
 *
 * Pins the required set and extras, the flat copy (subfolders, hidden files and README.md skipped),
 * the approved-or-later lock, `--replace` only while planning, the README Drop rows and
 * Schema-routes hash, and `--both`: a missing sibling iteration stops, a differing sibling copy
 * shows its diff and stops unless `--replace`.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addTestIteration,
  createIterationRepository,
  createScratchFolder,
  ITERATION_TEST_TODAY,
  removeIterationRepositories,
} from '@/tests/helpers/iteration-repository.helper.js';
import {
  applyIntake,
  displaySourcePath,
  parseIntakeArguments,
  planIntake,
} from '@tooling/iterations/iteration-intake.util.js';
import { parseIterationReadme } from '@tooling/iterations/iteration.util.js';

const ITERATION = 'launch-2026-09-30-jxmr';
const PRD = '# PRD\n';
const SCHEMA_ROUTES = '# schema-routes\n\n## Entity: Patient\n';

afterEach(() => {
  removeIterationRepositories();
});

function drop(files: Readonly<Record<string, string>>): string {
  const folder = createScratchFolder('iteration-drop-');
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith('/')) mkdirSync(join(folder, name), { recursive: true });
    else writeFileSync(join(folder, name), content);
  }
  return folder;
}

function readmeOf(repositoryRoot: string): ReadonlyMap<string, string> {
  return parseIterationReadme(
    readFileSync(join(repositoryRoot, 'iterations', ITERATION, 'README.md'), 'utf-8'),
  );
}

describe('parseIntakeArguments', () => {
  it('reads the iteration, source and flags', () => {
    expect(parseIntakeArguments([ITERATION, '~/drop', '--both', '--replace', '--dry-run'])).toEqual(
      {
        iteration: ITERATION,
        source: '~/drop',
        createInSibling: true,
        siblingPath: undefined,
        replace: true,
        dryRun: true,
        help: false,
      },
    );
    expect(parseIntakeArguments([ITERATION, 'x', '--sibling', '../fe']).createInSibling).toBe(true);
    expect(() => parseIntakeArguments([ITERATION, 'x', '--force'])).toThrow(/Unknown option/);
    expect(() => parseIntakeArguments([ITERATION, 'x', 'y'])).toThrow(/Too many/);
  });
});

describe('planIntake — this repository', () => {
  it('copies the full drop flat, skips subfolders, hidden files and README.md, and warns on extras', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({ repositoryRoot, name: ITERATION });
    const source = drop({
      'PRD.md': PRD,
      'schema-routes.md': SCHEMA_ROUTES,
      'design-overview.md': '# overview\n',
      'notes.txt': 'extra',
      'README.md': '# not ours',
      '.DS_Store': 'x',
      'screens/': '',
    });
    const plan = planIntake({
      repositoryRoot,
      iteration: ITERATION,
      source,
      siblingRoot: undefined,
      replace: false,
      today: ITERATION_TEST_TODAY,
    });
    expect(plan.problems).toEqual([]);
    expect(plan.missing).toEqual([]);
    expect(plan.extras).toEqual(['notes.txt']);
    expect(plan.local.files.map((file) => `${file.action} ${file.name}`)).toEqual([
      'copy PRD.md',
      'copy design-overview.md',
      'copy notes.txt',
      'copy schema-routes.md',
    ]);
    expect(plan.skipped.join(' ')).toMatch(/README\.md.*never copied|screens\/.*flat/);
    applyIntake(plan);
    const intake = join(repositoryRoot, 'iterations', ITERATION, 'intake-files');
    expect(readFileSync(join(intake, 'schema-routes.md'), 'utf-8')).toBe(SCHEMA_ROUTES);
    expect(existsSync(join(intake, 'README.md'))).toBe(false);
    const readme = readmeOf(repositoryRoot);
    expect(readme.get('Drop placed')).toBe(ITERATION_TEST_TODAY);
    expect(readme.get('Schema-routes')).toBe(
      createHash('sha256').update(SCHEMA_ROUTES).digest('hex').slice(0, 12),
    );
    expect(readme.get('Drop source')).toBe(displaySourcePath({ repositoryRoot, source }));
  });

  it('stops when a required file is missing', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({ repositoryRoot, name: ITERATION });
    const plan = planIntake({
      repositoryRoot,
      iteration: ITERATION,
      source: drop({ 'PRD.md': PRD }),
      siblingRoot: undefined,
      replace: false,
    });
    expect(plan.missing).toEqual(['schema-routes.md']);
    expect(plan.problems.join()).toMatch(/missing required file\(s\): schema-routes\.md/);
    expect(() => applyIntake(plan)).toThrow(/missing required/);
  });

  it('passes as a check when the drop matches intake-files — even once locked', () => {
    const repositoryRoot = createIterationRepository();
    const folder = addTestIteration({
      repositoryRoot,
      name: ITERATION,
      fields: { status: 'approved' },
      intake: { 'PRD.md': PRD, 'schema-routes.md': SCHEMA_ROUTES },
    });
    const plan = planIntake({
      repositoryRoot,
      iteration: ITERATION,
      source: join(folder, 'intake-files'),
      siblingRoot: undefined,
      replace: false,
    });
    expect(plan.problems).toEqual([]);
    expect(plan.local.locked).toBe(true);
    expect(plan.local.files.every((file) => file.action === 'unchanged')).toBe(true);
    expect(plan.local.readme).toBeUndefined();
  });

  it('refuses any change once the iteration is approved or later', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({ repositoryRoot, name: ITERATION, fields: { status: 'implementing' } });
    const plan = planIntake({
      repositoryRoot,
      iteration: ITERATION,
      source: drop({ 'PRD.md': PRD, 'schema-routes.md': SCHEMA_ROUTES }),
      siblingRoot: undefined,
      replace: false,
    });
    expect(plan.problems.join()).toMatch(/intake is locked \(Status implementing\)/);
  });

  it('shows the diff and stops on a differing file; --replace overwrites only while planning', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: ITERATION,
      intake: { 'PRD.md': '# PRD v-old\n', 'schema-routes.md': SCHEMA_ROUTES },
    });
    const source = drop({ 'PRD.md': PRD, 'schema-routes.md': SCHEMA_ROUTES });
    const request = { repositoryRoot, iteration: ITERATION, source, siblingRoot: undefined };
    const stopped = planIntake({ ...request, replace: false });
    expect(stopped.local.files.find((file) => file.name === 'PRD.md')?.action).toBe('conflict');
    expect(stopped.problems.join()).toMatch(/--replace/);
    expect(stopped.diffs.join()).toMatch(/-# PRD v-old\n\+# PRD/);
    const replaced = planIntake({ ...request, replace: true });
    expect(replaced.problems).toEqual([]);
    applyIntake(replaced);
    expect(
      readFileSync(
        join(repositoryRoot, 'iterations', ITERATION, 'intake-files', 'PRD.md'),
        'utf-8',
      ),
    ).toBe(PRD);
  });

  it('refuses --replace once the plan is ready for approval', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: ITERATION,
      fields: { status: 'ready-for-approval' },
      intake: { 'PRD.md': '# old\n', 'schema-routes.md': SCHEMA_ROUTES },
    });
    const plan = planIntake({
      repositoryRoot,
      iteration: ITERATION,
      source: drop({ 'PRD.md': PRD, 'schema-routes.md': SCHEMA_ROUTES }),
      siblingRoot: undefined,
      replace: true,
    });
    expect(plan.problems.join()).toMatch(/only while Status is planning/);
  });
});

describe('planIntake — --both', () => {
  it('stops when the sibling has no such iteration', () => {
    const repositoryRoot = createIterationRepository();
    const siblingRoot = createIterationRepository('demo-fe');
    addTestIteration({ repositoryRoot, name: ITERATION });
    const plan = planIntake({
      repositoryRoot,
      iteration: ITERATION,
      source: drop({ 'PRD.md': PRD, 'schema-routes.md': SCHEMA_ROUTES }),
      siblingRoot,
      replace: false,
    });
    expect(plan.problems.join()).toMatch(/iteration:new <type> <topic> --both/);
  });

  it('copies PRD.md and schema-routes.md only, and fills the sibling README rows', () => {
    const repositoryRoot = createIterationRepository();
    const siblingRoot = createIterationRepository('demo-fe');
    addTestIteration({ repositoryRoot, name: ITERATION });
    addTestIteration({ repositoryRoot: siblingRoot, name: ITERATION });
    const plan = planIntake({
      repositoryRoot,
      iteration: ITERATION,
      source: drop({ 'PRD.md': PRD, 'schema-routes.md': SCHEMA_ROUTES, 'design-overview.md': 'x' }),
      siblingRoot,
      replace: false,
      today: ITERATION_TEST_TODAY,
    });
    expect(plan.sibling?.files.map((file) => file.name)).toEqual(['PRD.md', 'schema-routes.md']);
    applyIntake(plan);
    expect(readmeOf(siblingRoot).get('Schema-routes')).toBe(
      readmeOf(repositoryRoot).get('Schema-routes'),
    );
    expect(readmeOf(siblingRoot).get('Drop placed')).toBe(ITERATION_TEST_TODAY);
  });

  it('shows the diff and stops when the sibling copy differs, unless --replace', () => {
    const repositoryRoot = createIterationRepository();
    const siblingRoot = createIterationRepository('demo-fe');
    addTestIteration({ repositoryRoot, name: ITERATION });
    addTestIteration({
      repositoryRoot: siblingRoot,
      name: ITERATION,
      intake: { 'schema-routes.md': '# schema-routes (designer v-old)\n' },
    });
    const source = drop({ 'PRD.md': PRD, 'schema-routes.md': SCHEMA_ROUTES });
    const request = { repositoryRoot, iteration: ITERATION, source, siblingRoot };
    const stopped = planIntake({ ...request, replace: false });
    expect(stopped.problems.join()).toMatch(/Sibling repository: schema-routes\.md already in/);
    expect(stopped.diffs.join()).toMatch(
      /Sibling repository intake-files\/schema-routes\.md differs/,
    );
    expect(planIntake({ ...request, replace: true }).problems).toEqual([]);
  });
});
