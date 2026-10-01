/**
 * Design-iteration tooling — `pnpm iteration:intake` and its `--check` gate
 * (`tooling/iterations/iteration-intake.util.ts`).
 *
 * Pins the shared intake contract with clinozy-fe: the three modes (full, overlay, brief) and the
 * snapshot each builds, the Intake note formats, the README rows, the launch-is-full rule, the
 * approved-or-later lock, replace-only-while-planning (removals included), the BRIEF.md sections,
 * `--both` on the sibling's own Baseline, and every gate failure with its message.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addTestIteration,
  createIterationRepository,
  createScratchFolder,
  ITERATION_TEST_TODAY,
  removeIterationRepositories,
  runTestGit,
} from '@/tests/helpers/iteration-repository.helper.js';
import {
  applyIntake,
  parseIntakeArguments,
  planIntake,
  readReceived,
  renderIntakeNote,
  runGate,
  runIntake,
} from '@tooling/iterations/iteration-intake.util.js';
import {
  BRIEF_SECTIONS,
  intakeHash,
  parseIterationReadme,
} from '@tooling/iterations/iteration.util.js';

const LAUNCH = 'launch-2026-09-30-jxmr';
const FEATURE = 'feat-returns-2026-10-06-kqzx';
const PRD = '# PRD\n';
const SCHEMA_ROUTES = '# schema-routes\n\n## Entity: Patient\n';
const COMPLETE = { 'PRD.md': PRD, 'schema-routes.md': SCHEMA_ROUTES };
const BRIEF = `# Brief — returns\n\n${BRIEF_SECTIONS.map((section) => `## ${section}\n\nnone\n`).join('\n')}`;

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

function fieldsOf(location: {
  repositoryRoot: string;
  iteration: string;
}): ReadonlyMap<string, string> {
  return parseIterationReadme(
    readFileSync(
      join(location.repositoryRoot, 'iterations', location.iteration, 'README.md'),
      'utf-8',
    ),
  );
}

function intakeOf(location: { repositoryRoot: string; iteration: string }): string {
  return join(location.repositoryRoot, 'iterations', location.iteration, 'intake-files');
}

/** A repository with a done launch (complete, recorded intake) and a feature built on it. */
function incrementalRepository(packageName = 'demo-be'): string {
  const repositoryRoot = createIterationRepository(packageName);
  addTestIteration({
    repositoryRoot,
    name: LAUNCH,
    fields: { status: 'done' },
    intake: COMPLETE,
    recordIntake: true,
  });
  addTestIteration({
    repositoryRoot,
    name: FEATURE,
    fields: { type: 'feat', opened: '2026-10-06', baseline: LAUNCH },
  });
  return repositoryRoot;
}

describe('parseIntakeArguments', () => {
  it('reads an intake with its mode and flags, or the gate', () => {
    expect(
      parseIntakeArguments([
        FEATURE,
        '~/drop',
        '--mode',
        'overlay',
        '--both',
        '--replace',
        '--dry-run',
      ]),
    ).toMatchObject({
      iteration: FEATURE,
      source: '~/drop',
      mode: 'overlay',
      check: false,
      createInSibling: true,
      replace: true,
      dryRun: true,
    });
    expect(parseIntakeArguments([FEATURE, '--check', '--baseline', LAUNCH])).toMatchObject({
      check: true,
      baseline: LAUNCH,
      mode: 'full',
    });
  });

  it('rejects an unknown mode, --check with intake options, and --baseline without --check', () => {
    expect(() => parseIntakeArguments([FEATURE, 'x', '--mode', 'patch'])).toThrow(
      /Unknown --mode "patch"/,
    );
    expect(() => parseIntakeArguments([FEATURE, 'x', '--check'])).toThrow(/--check takes only/);
    expect(() => parseIntakeArguments([FEATURE, '--check', '--both'])).toThrow(
      /--check takes only/,
    );
    expect(() => parseIntakeArguments([FEATURE, 'x', '--baseline', LAUNCH])).toThrow(
      /works only with --check/,
    );
    expect(() => parseIntakeArguments([FEATURE, 'x', '--mode'])).toThrow(/needs a value/);
  });
});

describe('readReceived and renderIntakeNote', () => {
  it('reads a folder flat (skipping hidden files, subfolders and README.md) or one file', () => {
    const folder = drop({ 'PRD.md': PRD, 'README.md': 'x', '.DS_Store': 'x', 'screens/': '' });
    const received = readReceived(folder);
    expect(received.names).toEqual(['PRD.md']);
    expect(received.skipped.join(' ')).toMatch(/README\.md.*never copied|screens\/.*flat/);
    expect(readReceived(join(folder, 'PRD.md'))).toEqual({
      folder,
      names: ['PRD.md'],
      skipped: [],
    });
  });

  it('writes the note: "<n> received" for full; received and carried forward otherwise', () => {
    expect(
      renderIntakeNote({
        mode: 'full',
        taken: ['PRD.md', 'schema-routes.md'],
        total: 2,
        baseline: undefined,
      }),
    ).toBe('2 received');
    expect(
      renderIntakeNote({ mode: 'overlay', taken: ['PRD.md'], total: 2, baseline: LAUNCH }),
    ).toBe(`1 received (PRD.md) · 1 carried forward from ${LAUNCH}`);
  });
});

describe('full intake', () => {
  it('places the drop and fills the six README rows', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({ repositoryRoot, name: LAUNCH });
    const plan = planIntake({
      repositoryRoot,
      iteration: LAUNCH,
      source: drop({ ...COMPLETE, 'design-overview.md': '# overview\n', 'notes.txt': 'x' }),
      siblingRoot: undefined,
      replace: false,
      today: ITERATION_TEST_TODAY,
    });
    expect(plan.problems).toEqual([]);
    expect(plan.extras).toEqual(['notes.txt']);
    applyIntake(plan);
    const fields = fieldsOf({ repositoryRoot, iteration: LAUNCH });
    expect(fields.get('Intake mode')).toBe('full');
    expect(fields.get('Intake note')).toBe('4 received');
    expect(fields.get('Drop placed')).toBe(ITERATION_TEST_TODAY);
    expect(fields.get('Intake hash')).toBe(
      intakeHash(intakeOf({ repositoryRoot, iteration: LAUNCH })),
    );
    expect(runGate({ repositoryRoot, iteration: LAUNCH, baseline: undefined }).exitCode).toBe(0);
  });

  it('stops when a mandatory file is missing, and the launch takes no other mode', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({ repositoryRoot, name: LAUNCH });
    const missing = planIntake({
      repositoryRoot,
      iteration: LAUNCH,
      source: drop({ 'PRD.md': PRD }),
      siblingRoot: undefined,
      replace: false,
    });
    expect(missing.problems.join()).toMatch(/missing mandatory file\(s\): schema-routes\.md/);
    const overlay = planIntake({
      repositoryRoot,
      iteration: LAUNCH,
      source: drop(COMPLETE),
      mode: 'overlay',
      siblingRoot: undefined,
      replace: false,
    });
    expect(overlay.problems).toEqual([
      'The launch is always --mode full: it has no Baseline to build on.',
    ]);
  });

  it('replaces a different snapshot only with --replace while planning — removals included', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: LAUNCH,
      intake: { ...COMPLETE, 'design-overview.md': 'old' },
      recordIntake: true,
    });
    const request = {
      repositoryRoot,
      iteration: LAUNCH,
      source: drop({ 'PRD.md': '# PRD v2\n', 'schema-routes.md': SCHEMA_ROUTES }),
      siblingRoot: undefined,
    };
    const stopped = planIntake({ ...request, replace: false });
    expect(stopped.problems.join()).toMatch(
      /already holds a different snapshot \(changed: PRD\.md · removed: design-overview\.md\) — re-run with --replace/,
    );
    expect(stopped.diffs.join()).toMatch(/-# PRD\n\+# PRD v2/);
    applyIntake(planIntake({ ...request, replace: true }));
    expect(
      existsSync(join(intakeOf({ repositoryRoot, iteration: LAUNCH }), 'design-overview.md')),
    ).toBe(false);
    expect(fieldsOf({ repositoryRoot, iteration: LAUNCH }).get('Intake note')).toBe('2 received');
  });

  it('locks the intake from approved on — even re-recording the hash', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: LAUNCH,
      fields: { status: 'approved' },
      intake: COMPLETE,
    });
    const plan = planIntake({
      repositoryRoot,
      iteration: LAUNCH,
      source: intakeOf({ repositoryRoot, iteration: LAUNCH }),
      siblingRoot: undefined,
      replace: true,
    });
    expect(plan.problems.join()).toMatch(/the intake is locked \(Status approved\)/);
  });

  it('refuses --replace once the plan is ready for approval', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: LAUNCH,
      fields: { status: 'ready-for-approval' },
      intake: COMPLETE,
      recordIntake: true,
    });
    const plan = planIntake({
      repositoryRoot,
      iteration: LAUNCH,
      source: drop({ 'PRD.md': '# PRD v2\n', 'schema-routes.md': SCHEMA_ROUTES }),
      siblingRoot: undefined,
      replace: true,
    });
    expect(plan.problems.join()).toMatch(
      /only while Status is planning \(it is ready-for-approval\)/,
    );
  });

  it('asks for the new README rows when a README predates them', () => {
    const repositoryRoot = createIterationRepository();
    const folder = addTestIteration({ repositoryRoot, name: LAUNCH });
    const readmePath = join(folder, 'README.md');
    writeFileSync(
      readmePath,
      readFileSync(readmePath, 'utf-8').replace(/\| Intake (mode|note|hash) \| — \|\n/g, ''),
    );
    const plan = planIntake({
      repositoryRoot,
      iteration: LAUNCH,
      source: drop(COMPLETE),
      siblingRoot: undefined,
      replace: false,
    });
    expect(plan.problems.join()).toMatch(
      /README\.md has no Intake mode, Intake note, Intake hash row — it predates the field; add the rows from tooling\/iterations\/templates\/README\.md/,
    );
  });
});

describe('overlay and brief intake', () => {
  it('overlay lays the received files over the Baseline snapshot', () => {
    const repositoryRoot = incrementalRepository();
    const plan = planIntake({
      repositoryRoot,
      iteration: FEATURE,
      source: drop({ 'PRD.md': '# PRD v2\n' }),
      mode: 'overlay',
      siblingRoot: undefined,
      replace: false,
    });
    expect(plan.problems).toEqual([]);
    expect(plan.baseline).toBe(LAUNCH);
    applyIntake(plan);
    const intake = intakeOf({ repositoryRoot, iteration: FEATURE });
    expect(readFileSync(join(intake, 'PRD.md'), 'utf-8')).toBe('# PRD v2\n');
    expect(readFileSync(join(intake, 'schema-routes.md'), 'utf-8')).toBe(SCHEMA_ROUTES);
    expect(fieldsOf({ repositoryRoot, iteration: FEATURE }).get('Intake note')).toBe(
      `1 received (PRD.md) · 1 carried forward from ${LAUNCH}`,
    );
    expect(runGate({ repositoryRoot, iteration: FEATURE, baseline: LAUNCH }).exitCode).toBe(0);
  });

  it('overlay and brief need a confirmed Baseline whose intake passes the gate', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: LAUNCH,
      fields: { status: 'done' },
      intake: COMPLETE,
    });
    addTestIteration({
      repositoryRoot,
      name: FEATURE,
      fields: { type: 'feat', opened: '2026-10-06', baseline: '—' },
    });
    const unconfirmed = planIntake({
      repositoryRoot,
      iteration: FEATURE,
      source: drop({ 'PRD.md': PRD }),
      mode: 'overlay',
      siblingRoot: undefined,
      replace: false,
    });
    expect(unconfirmed.problems.join()).toMatch(
      /has Baseline — — confirm it first: pnpm iteration:baseline/,
    );
    addTestIteration({
      repositoryRoot,
      name: FEATURE,
      fields: { type: 'feat', opened: '2026-10-06', baseline: LAUNCH },
    });
    const unrecorded = planIntake({
      repositoryRoot,
      iteration: FEATURE,
      source: drop({ 'PRD.md': PRD }),
      mode: 'overlay',
      siblingRoot: undefined,
      replace: false,
    });
    expect(unrecorded.problems.join()).toMatch(
      new RegExp(`the Baseline ${LAUNCH} fails the gate — changed since the intake`),
    );
  });

  it('brief adds the received BRIEF.md and nothing else', () => {
    const repositoryRoot = incrementalRepository();
    const plan = planIntake({
      repositoryRoot,
      iteration: FEATURE,
      source: drop({ 'BRIEF.md': BRIEF, 'PRD.md': PRD }),
      mode: 'brief',
      siblingRoot: undefined,
      replace: false,
    });
    expect(plan.problems).toEqual([]);
    applyIntake(plan);
    expect(fieldsOf({ repositoryRoot, iteration: FEATURE }).get('Intake note')).toBe(
      `1 received (BRIEF.md) · 2 carried forward from ${LAUNCH}`,
    );
    expect(runGate({ repositoryRoot, iteration: FEATURE, baseline: LAUNCH }).exitCode).toBe(0);
  });

  it('brief refuses a missing BRIEF.md, missing sections and any other changed file', () => {
    const repositoryRoot = incrementalRepository();
    const plan = (files: Record<string, string>) =>
      planIntake({
        repositoryRoot,
        iteration: FEATURE,
        source: drop(files),
        mode: 'brief',
        siblingRoot: undefined,
        replace: false,
      });
    expect(plan({ 'PRD.md': PRD }).problems.join()).toMatch(
      /--mode brief needs a received BRIEF\.md — start from tooling\/iterations\/templates\/BRIEF\.md/,
    );
    expect(plan({ 'BRIEF.md': '# Brief\n\n## Why\n' }).problems.join()).toMatch(
      /BRIEF\.md is missing section\(s\): What changes, Affected screens, entities and routes, Rules, Acceptance criteria, Out of scope/,
    );
    expect(plan({ 'BRIEF.md': BRIEF, 'PRD.md': '# PRD v2\n' }).problems.join()).toMatch(
      new RegExp(
        `--mode brief changes only BRIEF\\.md, but PRD\\.md differs from the Baseline ${LAUNCH} — use --mode overlay`,
      ),
    );
  });
});

describe('the gate (--check)', () => {
  it('passes a recorded intake and prints one line per folder', () => {
    const repositoryRoot = incrementalRepository();
    const result = runGate({ repositoryRoot, iteration: LAUNCH, baseline: undefined });
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toMatch(
      new RegExp(
        `^✓ iterations/${LAUNCH}/intake-files/ — 2 files, mandatory set complete, Intake hash [0-9a-f]{12} unchanged \\(Intake mode full\\)$`,
      ),
    );
    expect(result.lines.at(-1)).toBe('Gate passed.');
  });

  it('fails on no intake, an edited file (named by git), a wrong Baseline and an unknown iteration', () => {
    const repositoryRoot = incrementalRepository();
    const empty = runGate({ repositoryRoot, iteration: FEATURE, baseline: undefined });
    expect(empty.lines).toEqual([
      'Gate failed — 1 problem. Stop here: write nothing, change no status.',
      `✗ iterations/${FEATURE}/intake-files/: no intake yet`,
      `    fix: place it: pnpm iteration:intake ${FEATURE} <source>`,
    ]);
    runTestGit({ repositoryRoot, gitArguments: ['add', '-A'] });
    runTestGit({ repositoryRoot, gitArguments: ['commit', '-q', '-m', 'iterations'] });
    writeFileSync(
      join(intakeOf({ repositoryRoot, iteration: LAUNCH }), 'PRD.md'),
      '# PRD (edited)\n',
    );
    const edited = runGate({ repositoryRoot, iteration: LAUNCH, baseline: undefined });
    expect(edited.exitCode).toBe(1);
    expect(edited.lines.join('\n')).toMatch(
      /changed since the intake — the Intake hash is [0-9a-f]{12}, the README records [0-9a-f]{12}\n {4}Uncommitted: modified PRD\.md/,
    );
    const wrongBaseline = runGate({
      repositoryRoot,
      iteration: FEATURE,
      baseline: 'launch-2026-01-01-zzzz',
    });
    expect(wrongBaseline.lines.join('\n')).toContain(
      `✗ iterations/${FEATURE}/README.md: the Baseline is ${LAUNCH}, not launch-2026-01-01-zzzz`,
    );
    expect(wrongBaseline.lines.join('\n')).toContain(
      '✗ iterations/launch-2026-01-01-zzzz/: no such iteration (no README.md)',
    );
  });

  it('fails an overlay whose note names another Baseline than the README', () => {
    const repositoryRoot = incrementalRepository();
    addTestIteration({
      repositoryRoot,
      name: FEATURE,
      fields: {
        type: 'feat',
        opened: '2026-10-06',
        baseline: LAUNCH,
        intakeMode: 'overlay',
        intakeNote: '1 received (PRD.md) · 1 carried forward from fix-old-2026-10-02-aaaa',
      },
      intake: COMPLETE,
      recordIntake: true,
    });
    const result = runGate({ repositoryRoot, iteration: FEATURE, baseline: undefined });
    expect(result.lines.join('\n')).toContain(
      `the overlay snapshot was built on fix-old-2026-10-02-aaaa, but the README's Baseline is ${LAUNCH}`,
    );
  });
});

describe('--both', () => {
  it('stops when the sibling has no such iteration', () => {
    const repositoryRoot = createIterationRepository();
    const siblingRoot = createIterationRepository('demo-fe');
    addTestIteration({ repositoryRoot, name: LAUNCH });
    const plan = planIntake({
      repositoryRoot,
      iteration: LAUNCH,
      source: drop(COMPLETE),
      siblingRoot,
      replace: false,
    });
    expect(plan.problems.join()).toMatch(
      /open it in both first: pnpm iteration:new <type> <topic> --both/,
    );
  });

  it('full: gives the sibling PRD.md and schema-routes.md, and fills its rows', () => {
    const repositoryRoot = createIterationRepository();
    const siblingRoot = createIterationRepository('demo-fe');
    addTestIteration({ repositoryRoot, name: LAUNCH });
    addTestIteration({ repositoryRoot: siblingRoot, name: LAUNCH });
    const plan = planIntake({
      repositoryRoot,
      iteration: LAUNCH,
      source: drop({ ...COMPLETE, 'design-overview.md': 'x' }),
      siblingRoot,
      replace: false,
      today: ITERATION_TEST_TODAY,
    });
    expect(plan.sibling?.files.map((file) => `${file.action} ${file.name}`)).toEqual([
      'add PRD.md',
      'add schema-routes.md',
    ]);
    applyIntake(plan);
    const sibling = fieldsOf({ repositoryRoot: siblingRoot, iteration: LAUNCH });
    expect(sibling.get('Intake note')).toBe('2 received');
    expect(sibling.get('Schema-routes')).toBe(
      fieldsOf({ repositoryRoot, iteration: LAUNCH }).get('Schema-routes'),
    );
  });

  it('shows the diff and stops when the sibling copy differs, unless --replace', () => {
    const repositoryRoot = createIterationRepository();
    const siblingRoot = createIterationRepository('demo-fe');
    addTestIteration({ repositoryRoot, name: LAUNCH });
    addTestIteration({
      repositoryRoot: siblingRoot,
      name: LAUNCH,
      intake: { 'schema-routes.md': '# old\n' },
    });
    const request = { repositoryRoot, iteration: LAUNCH, source: drop(COMPLETE), siblingRoot };
    const stopped = planIntake({ ...request, replace: false });
    expect(stopped.problems.join()).toMatch(
      /Sibling repository: intake-files\/ already holds a different snapshot/,
    );
    expect(stopped.diffs.join()).toMatch(
      /Sibling repository: intake-files\/schema-routes\.md differs from the new snapshot/,
    );
    expect(planIntake({ ...request, replace: true }).problems).toEqual([]);
  });

  it('brief: builds the sibling on its own Baseline, whose PRD and schema-routes must match', () => {
    const repositoryRoot = incrementalRepository();
    const siblingRoot = incrementalRepository('demo-fe');
    const plan = planIntake({
      repositoryRoot,
      iteration: FEATURE,
      source: drop({ 'BRIEF.md': BRIEF }),
      mode: 'brief',
      siblingRoot,
      replace: false,
    });
    expect(plan.problems).toEqual([]);
    expect(plan.sibling?.note).toBe(`1 received (BRIEF.md) · 2 carried forward from ${LAUNCH}`);

    writeFileSync(
      join(intakeOf({ repositoryRoot: siblingRoot, iteration: LAUNCH }), 'PRD.md'),
      '# PRD (sibling)\n',
    );
    const mismatch = planIntake({
      repositoryRoot,
      iteration: FEATURE,
      source: drop({ 'BRIEF.md': BRIEF }),
      mode: 'brief',
      siblingRoot,
      replace: false,
    });
    expect(mismatch.problems.join()).toMatch(
      new RegExp(
        `Sibling repository: --mode brief changes only BRIEF\\.md, but PRD\\.md differs from the Baseline ${LAUNCH}`,
      ),
    );
  });
});

describe('runIntake', () => {
  it('reports a dry run, a stop and a placed intake', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({ repositoryRoot, name: LAUNCH });
    const source = drop(COMPLETE);
    const run = (commandLine: string[]) =>
      runIntake({
        commandLine,
        repositoryRoot,
        resolveSibling: () => '',
        today: ITERATION_TEST_TODAY,
      });
    const dry = run([LAUNCH, source, '--dry-run']);
    expect(dry.exitCode).toBe(0);
    expect(dry.lines[0]).toBe('Dry run — nothing written; the snapshot passes.');
    const stopped = run([LAUNCH, source, '--mode', 'brief']);
    expect(stopped.exitCode).toBe(1);
    expect(stopped.lines.at(-1)).toBe('Nothing written.');
    const placed = run([LAUNCH, source]);
    expect(placed.lines[0]).toBe('Placed.');
    expect(placed.lines.at(-1)).toBe(
      `Next: say "plan iteration ${LAUNCH}" — planning runs the gate first: pnpm iteration:intake ${LAUNCH} --check`,
    );
    expect(run([LAUNCH, '--check']).exitCode).toBe(0);
  });
});
