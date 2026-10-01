/**
 * `pnpm iteration:intake` — place a design drop into an iteration's `intake-files/` and check it.
 *
 * The drop is copied flat and exactly as delivered (never `README.md`); this repository's required
 * set is checked; the README's Drop placed, Drop source and Schema-routes rows are filled. Under
 * `--both`, `PRD.md` and `schema-routes.md` also go to the sibling repository's same-named
 * iteration. The intake is locked once the iteration is approved.
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { gitEnvironmentWithoutInheritedRepository } from '@tooling/setup/common/git-environment.js';
import {
  INTAKE_DIRECTORY,
  ITERATIONS_DIRECTORY,
  type IterationStatus,
  isIterationStatus,
  LOCKED_INTAKE_STATUSES,
  OPTIONAL_INTAKE_FILES,
  REQUIRED_INTAKE_FILES,
  SHARED_INTAKE_FILES,
  localDate,
  readIterationReadme,
  schemaRoutesHash,
  setReadmeField,
} from './iteration.util.js';

/** Lines of a conflicting file's diff shown before stopping. */
const DIFF_PREVIEW_LINES = 120;

/** What happens to one file of the drop in one repository. */
export type IntakeAction = 'copy' | 'replace' | 'unchanged' | 'conflict';

/** One file of the drop and what the intake does with it. */
export interface IntakeFile {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly action: IntakeAction;
}

/** The intake for one repository's iteration folder. */
export interface IntakeSide {
  readonly repositoryRoot: string;
  readonly readmePath: string;
  readonly status: string;
  readonly locked: boolean;
  readonly files: readonly IntakeFile[];
  /** The README with Drop placed, Drop source and Schema-routes filled — set when files change. */
  readonly readme: string | undefined;
}

/** Everything `pnpm iteration:intake` decided, before anything is written. */
export interface IntakePlan {
  readonly iteration: string;
  readonly source: string;
  readonly local: IntakeSide;
  readonly sibling: IntakeSide | undefined;
  readonly missing: readonly string[];
  readonly extras: readonly string[];
  readonly skipped: readonly string[];
  readonly diffs: readonly string[];
  /** Reasons to stop: when any is present, nothing is written and the command exits non-zero. */
  readonly problems: readonly string[];
}

/** Parsed `pnpm iteration:intake` command line. */
export interface IntakeArguments {
  readonly iteration: string | undefined;
  readonly source: string | undefined;
  readonly createInSibling: boolean;
  readonly siblingPath: string | undefined;
  readonly replace: boolean;
  readonly dryRun: boolean;
  readonly help: boolean;
}

/**
 * Parses `pnpm iteration:intake <iteration> <source-folder> [--both] [--sibling <path>]
 * [--replace] [--dry-run]`.
 *
 * @remarks
 * Failure modes: throws on an unknown option, a `--sibling` without a path, or a third positional.
 * `--sibling` implies `--both`.
 */
export function parseIntakeArguments(commandLine: readonly string[]): IntakeArguments {
  const positionals: string[] = [];
  let createInSibling = false;
  let siblingPath: string | undefined;
  let replace = false;
  let dryRun = false;
  let help = false;
  for (let index = 0; index < commandLine.length; index += 1) {
    const token = commandLine[index] ?? '';
    if (token === '--both') createInSibling = true;
    else if (token === '--replace') replace = true;
    else if (token === '--dry-run') dryRun = true;
    else if (token === '--help' || token === '-h') help = true;
    else if (token === '--sibling') {
      siblingPath = commandLine[index + 1];
      if (siblingPath === undefined || siblingPath.startsWith('--')) {
        throw new Error('--sibling needs a path, e.g. --sibling ../clinozy-fe');
      }
      createInSibling = true;
      index += 1;
    } else if (token.startsWith('-')) throw new Error(`Unknown option "${token}".`);
    else positionals.push(token);
  }
  if (positionals.length > 2) {
    throw new Error(
      `Too many arguments: ${positionals.join(' ')} — expected <iteration> <source-folder>.`,
    );
  }
  return {
    iteration: positionals[0],
    source: positionals[1],
    createInSibling,
    siblingPath,
    replace,
    dryRun,
    help,
  };
}

/** Shows a source folder the way a person typed it: repository-relative, `~/…`, or absolute. */
export function displaySourcePath(location: {
  readonly repositoryRoot: string;
  readonly source: string;
}): string {
  const fromRepository = relative(location.repositoryRoot, location.source);
  if (fromRepository !== '' && !fromRepository.startsWith('..')) return fromRepository;
  const home = homedir();
  if (location.source === home) return '~';
  if (location.source.startsWith(`${home}${sep}`)) return `~${location.source.slice(home.length)}`;
  return location.source;
}

/** Returns the unified diff of two files (`git diff --no-index`), trimmed for the terminal. */
export function fileDiff(files: { readonly before: string; readonly after: string }): string {
  const result = spawnSync('git', ['diff', '--no-index', '--', files.before, files.after], {
    encoding: 'utf-8',
    env: gitEnvironmentWithoutInheritedRepository(),
  });
  const lines = (result.stdout ?? '').split('\n');
  return lines.length > DIFF_PREVIEW_LINES
    ? [
        ...lines.slice(0, DIFF_PREVIEW_LINES),
        `… ${lines.length - DIFF_PREVIEW_LINES} more lines`,
      ].join('\n')
    : lines.join('\n');
}

function sameBytes(left: string, right: string): boolean {
  return readFileSync(left).equals(readFileSync(right));
}

function planSide(request: {
  readonly repositoryRoot: string;
  readonly iteration: string;
  readonly source: string;
  readonly names: readonly string[];
  readonly replace: boolean;
  readonly label: string;
  readonly problems: string[];
  readonly diffs: string[];
}): Omit<IntakeSide, 'readme'> {
  const { repositoryRoot, iteration, source, names, replace, label, problems, diffs } = request;
  const readme = readIterationReadme({ repositoryRoot, iteration });
  const status = readme.fields.get('Status') ?? '';
  const locked = isIterationStatus(status) && LOCKED_INTAKE_STATUSES.has(status as IterationStatus);
  const intakeFolder = join(repositoryRoot, ITERATIONS_DIRECTORY, iteration, INTAKE_DIRECTORY);
  const files = names.map((name): IntakeFile => {
    const from = join(source, name);
    const to = join(intakeFolder, name);
    if (!existsSync(to)) return { name, from, to, action: 'copy' };
    if (sameBytes(from, to)) return { name, from, to, action: 'unchanged' };
    if (replace) return { name, from, to, action: 'replace' };
    diffs.push(
      `${label} ${INTAKE_DIRECTORY}/${name} differs from the drop:\n${fileDiff({ before: to, after: from })}`,
    );
    return { name, from, to, action: 'conflict' };
  });
  const conflicts = files.filter((file) => file.action === 'conflict').map((file) => file.name);
  if (conflicts.length > 0) {
    problems.push(
      `${label}: ${conflicts.join(', ')} already in ${INTAKE_DIRECTORY}/ with different content — re-run with --replace (only while planning) to overwrite.`,
    );
  }
  const changes = files.filter((file) => file.action === 'copy' || file.action === 'replace');
  if (changes.length > 0 && locked) {
    problems.push(
      `${label}: the intake is locked (Status ${status}) — move it back first: pnpm iteration:status ${iteration} planning --reason "<why>".`,
    );
  }
  if (files.some((file) => file.action === 'replace') && status !== 'planning') {
    problems.push(
      `${label}: --replace overwrites only while Status is planning (it is ${status}).`,
    );
  }
  return { repositoryRoot, readmePath: readme.path, status, locked, files };
}

function filledReadme(update: {
  readonly side: Omit<IntakeSide, 'readme'>;
  readonly today: string;
  readonly sourceDisplay: string;
  readonly schemaRoutesSource: string;
}): string | undefined {
  const { side } = update;
  if (!side.files.some((file) => file.action === 'copy' || file.action === 'replace'))
    return undefined;
  let readme = readFileSync(side.readmePath, 'utf-8');
  readme = setReadmeField({ readme, label: 'Drop placed', value: update.today });
  readme = setReadmeField({ readme, label: 'Drop source', value: update.sourceDisplay });
  readme = setReadmeField({
    readme,
    label: 'Schema-routes',
    value: schemaRoutesHash(update.schemaRoutesSource),
  });
  return readme;
}

/**
 * Decides everything `pnpm iteration:intake` will do, without writing anything.
 *
 * @remarks
 * Algorithm: lists the source folder's files (flat — subfolders, hidden files and `README.md` are
 * skipped and reported); checks the required set ({@link REQUIRED_INTAKE_FILES}) and reports extras;
 * classifies each file against `intake-files/` as copy, unchanged, replace (with `--replace`) or
 * conflict (with a diff); refuses any change while Status is `approved` or later; under `--both`,
 * does the same for {@link SHARED_INTAKE_FILES} in the sibling's same-named iteration, which must
 * exist. The README rows are filled only for a side whose files change.
 *
 * Failure modes: throws when the source folder or the iteration does not exist; every other
 * refusal is a `problems` entry, so a dry run can report all of them at once.
 *
 * Side effects: reads files and runs `git diff --no-index` for conflicts; writes nothing.
 */
export function planIntake(request: {
  readonly repositoryRoot: string;
  readonly iteration: string | undefined;
  readonly source: string | undefined;
  readonly siblingRoot: string | undefined;
  readonly replace: boolean;
  readonly today?: string;
}): IntakePlan {
  const { repositoryRoot, iteration, siblingRoot, replace } = request;
  if (iteration === undefined || request.source === undefined) {
    throw new Error(
      'Usage: pnpm iteration:intake <iteration> <source-folder> [--both] [--replace] [--dry-run]',
    );
  }
  const source = resolve(repositoryRoot, request.source);
  if (!(existsSync(source) && statSync(source).isDirectory())) {
    throw new Error(`Source folder not found: ${source}`);
  }
  const names: string[] = [];
  const skipped: string[] = [];
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory())
      skipped.push(`${entry.name}/ (the intake is flat — subfolders are not copied)`);
    else if (entry.name === 'README.md')
      skipped.push('README.md (never copied — the iteration owns its README)');
    else if (entry.isFile()) names.push(entry.name);
  }
  names.sort();
  const known = new Set<string>([...REQUIRED_INTAKE_FILES, ...OPTIONAL_INTAKE_FILES]);
  const missing = REQUIRED_INTAKE_FILES.filter((name) => !names.includes(name));
  const extras = names.filter((name) => !known.has(name));
  const problems: string[] = [];
  const diffs: string[] = [];
  if (missing.length > 0) {
    problems.push(`The drop is missing required file(s): ${missing.join(', ')}.`);
  }

  const today = request.today ?? localDate(new Date());
  const sourceDisplay = displaySourcePath({ repositoryRoot, source });
  const schemaRoutesSource = join(source, 'schema-routes.md');
  const localPlan = planSide({
    repositoryRoot,
    iteration,
    source,
    names,
    replace,
    label: 'This repository',
    problems,
    diffs,
  });

  let sibling: IntakeSide | undefined;
  if (siblingRoot !== undefined) {
    const siblingReadme = join(siblingRoot, ITERATIONS_DIRECTORY, iteration, 'README.md');
    if (!existsSync(siblingReadme)) {
      problems.push(
        `The sibling repository has no iteration ${iteration} — open it in both first: pnpm iteration:new <type> <topic> --both.`,
      );
    } else {
      const sharedNames = SHARED_INTAKE_FILES.filter((name) => names.includes(name));
      const siblingPlan = planSide({
        repositoryRoot: siblingRoot,
        iteration,
        source,
        names: sharedNames,
        replace,
        label: 'Sibling repository',
        problems,
        diffs,
      });
      sibling = {
        ...siblingPlan,
        readme: filledReadme({ side: siblingPlan, today, sourceDisplay, schemaRoutesSource }),
      };
    }
  }

  return {
    iteration,
    source,
    local: {
      ...localPlan,
      readme: filledReadme({ side: localPlan, today, sourceDisplay, schemaRoutesSource }),
    },
    sibling,
    missing,
    extras,
    skipped,
    diffs,
    problems,
  };
}

/**
 * Writes an intake plan: copies the changed files and writes the filled READMEs.
 *
 * @remarks
 * Failure modes: throws without writing when the plan has problems.
 *
 * Side effects: creates `intake-files/` and copies files in this repository and, under `--both`,
 * the sibling; rewrites each changed side's README rows.
 */
export function applyIntake(plan: IntakePlan): void {
  if (plan.problems.length > 0) throw new Error(plan.problems.join('\n'));
  for (const side of [plan.local, plan.sibling]) {
    if (side === undefined) continue;
    for (const file of side.files) {
      if (file.action !== 'copy' && file.action !== 'replace') continue;
      mkdirSync(join(file.to, '..'), { recursive: true });
      copyFileSync(file.from, file.to);
    }
    if (side.readme !== undefined) writeFileSync(side.readmePath, side.readme);
  }
}
