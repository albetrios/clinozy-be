/**
 * `pnpm iteration:intake` — write an iteration's full snapshot into `intake-files/`, or check it.
 *
 * `intake-files/` always holds a full snapshot, whatever arrived. `full` (the default, and always
 * the launch's): the drop as received. `overlay`: the Baseline's snapshot with the received files
 * laid over it. `brief`: the Baseline's snapshot plus the received `BRIEF.md`, and no other changed
 * file. The backend's mandatory set is checked on the resulting snapshot, and the README's Drop
 * placed, Drop source, Intake mode, Intake note, Schema-routes and Intake hash rows are filled.
 * Under `--both` the sibling repository's same-named iteration gets a snapshot in the same mode,
 * built on its own Baseline. `--check` is the gate the iteration skills run before planning and
 * building. The contract is shared, byte for byte, with the frontend repository.
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { gitEnvironmentWithoutInheritedRepository } from '@tooling/setup/common/git-environment.js';
import {
  BRIEF_FILE,
  checkIntakeSet,
  DEFAULT_INTAKE_MODE,
  EMPTY_FIELD,
  flatFileNames,
  INTAKE_DIRECTORY,
  INTAKE_MODES,
  type IntakeMode,
  ITERATIONS_DIRECTORY,
  intakeHash,
  isIntakeMode,
  isIterationStatus,
  LOCKED_INTAKE_STATUSES,
  localDate,
  missingBriefSections,
  NO_BASELINE,
  parseIterationName,
  README_FIELD_LABELS,
  readIterationReadme,
  recordedIntakeMode,
  SHARED_INTAKE_FILES,
  schemaRoutesHash,
  setReadmeField,
  snapshotFingerprint,
} from './iteration.util.js';

/** Where the `BRIEF.md` template lives (shared byte for byte with the frontend repository). */
export const BRIEF_TEMPLATE = 'tooling/iterations/templates/BRIEF.md';

/** Lines of a differing file's diff shown before stopping. */
const DIFF_PREVIEW_LINES = 120;

/** The end of an overlay or brief Intake note, naming the Baseline the snapshot was built on. */
const BUILT_ON = / carried forward from (\S+)$/;

const SKIPPED_README = 'README.md (never copied — the iteration owns its README)';

/** Parsed `pnpm iteration:intake` command line. */
export interface IntakeArguments {
  readonly iteration: string | undefined;
  readonly source: string | undefined;
  readonly mode: IntakeMode;
  readonly check: boolean;
  readonly baseline: string | undefined;
  readonly createInSibling: boolean;
  readonly siblingPath: string | undefined;
  readonly replace: boolean;
  readonly dryRun: boolean;
  readonly help: boolean;
}

/** One file of a snapshot and what the intake does with it in one repository. */
export interface IntakeFile {
  readonly name: string;
  readonly from: string | undefined;
  readonly to: string;
  readonly action: 'add' | 'replace' | 'remove' | 'unchanged';
}

/** The intake for one repository's iteration folder. */
export interface IntakeSide {
  readonly folder: string;
  readonly readmePath: string;
  /** The README with the six intake rows filled — set when the snapshot or its record changes. */
  readonly readme: string | undefined;
  readonly status: string;
  readonly note: string;
  readonly hash: string;
  readonly files: readonly IntakeFile[];
}

/** Everything `pnpm iteration:intake` decided, before anything is written. */
export interface IntakePlan {
  readonly iteration: string;
  readonly mode: IntakeMode;
  readonly source: string;
  readonly sourceDisplay: string;
  readonly baseline: string | undefined;
  readonly local: IntakeSide | undefined;
  readonly sibling: IntakeSide | undefined;
  readonly extras: readonly string[];
  readonly skipped: readonly string[];
  readonly diffs: readonly string[];
  /** Reasons to stop: when any is present, nothing is written and the command exits non-zero. */
  readonly problems: readonly string[];
}

/** A command's printable result. */
export interface CommandResult {
  readonly exitCode: number;
  readonly lines: readonly string[];
}

interface BaselineFiles {
  readonly name: string;
  readonly files: ReadonlyMap<string, string>;
}

interface Snapshot {
  readonly files: ReadonlyMap<string, string>;
  readonly taken: readonly string[];
}

interface GateFailure {
  readonly what: string;
  readonly details: readonly string[];
  readonly fix: string;
}

/** The usage text, shared by `--help` and argument errors. */
export const INTAKE_USAGE = `Usage:
  pnpm iteration:intake <iteration> <source> [--mode full|overlay|brief] [--both] [--sibling <path>] [--replace] [--dry-run]
  pnpm iteration:intake <iteration> --check [--baseline <iteration>]

  <source>          the folder (or the one file) that arrived
  --mode full       the whole drop (the default; always the launch)
  --mode overlay    only the changed files, laid over the Baseline's snapshot
  --mode brief      only ${BRIEF_FILE} (template: ${BRIEF_TEMPLATE}), added to the Baseline's snapshot
  --both            also build the sibling repository's same-named iteration, in the same mode on its own
                    Baseline, with PRD.md and schema-routes.md (and ${BRIEF_FILE} in brief mode)
  --sibling <path>  sibling repository path (default: ../<package name with -be → -fe>)
  --replace         replace a different existing snapshot (only while Status is planning)
  --dry-run         check and report; write nothing
  --check           the gate: every mandatory file present and the Intake hash unchanged
  --baseline <it>   with --check: check that iteration too, and that it is the README's Baseline`;

/**
 * Parses `<iteration> <source> [--mode <mode>] [--both] [--sibling <path>] [--replace] [--dry-run]`
 * or `<iteration> --check [--baseline <iteration>]`.
 *
 * @remarks
 * Failure modes: throws on an unknown option or mode, an option without its value, a third
 * positional, `--check` mixed with intake options, or `--baseline` without `--check`. `--sibling`
 * implies `--both`.
 */
export function parseIntakeArguments(commandLine: readonly string[]): IntakeArguments {
  const positionals: string[] = [];
  const values = new Map<string, string>();
  let createInSibling = false;
  let siblingPath: string | undefined;
  let replace = false;
  let dryRun = false;
  let check = false;
  let help = false;
  for (let index = 0; index < commandLine.length; index += 1) {
    const token = commandLine[index] ?? '';
    if (token === '--both') createInSibling = true;
    else if (token === '--replace') replace = true;
    else if (token === '--dry-run') dryRun = true;
    else if (token === '--check') check = true;
    else if (token === '--help' || token === '-h') help = true;
    else if (token === '--sibling' || token === '--mode' || token === '--baseline') {
      const value = commandLine[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${token} needs a value.`);
      }
      if (token === '--sibling') {
        siblingPath = value;
        createInSibling = true;
      } else values.set(token, value);
      index += 1;
    } else if (token.startsWith('-')) throw new Error(`Unknown option "${token}".`);
    else positionals.push(token);
  }
  if (positionals.length > 2) {
    throw new Error(
      `Too many arguments: ${positionals.join(' ')} — expected <iteration> <source>, or <iteration> --check.`,
    );
  }
  const mode = values.get('--mode') ?? DEFAULT_INTAKE_MODE;
  if (!isIntakeMode(mode)) {
    throw new Error(`Unknown --mode "${mode}" — use ${INTAKE_MODES.join(', ')}.`);
  }
  const options: IntakeArguments = {
    iteration: positionals[0],
    source: positionals[1],
    mode,
    check,
    baseline: values.get('--baseline'),
    createInSibling,
    siblingPath,
    replace,
    dryRun,
    help,
  };
  const intakeOptions =
    options.source !== undefined || values.has('--mode') || createInSibling || replace || dryRun;
  if (check && intakeOptions)
    throw new Error('--check takes only <iteration> [--baseline <iteration>].');
  if (!check && options.baseline !== undefined) {
    throw new Error(
      "--baseline works only with --check — an intake builds on the README's Baseline (pnpm iteration:baseline).",
    );
  }
  return options;
}

/** Shows a source the way a person typed it: repository-relative, `~/…`, or absolute. */
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

function tryGit(command: {
  readonly repositoryRoot: string;
  readonly gitArguments: readonly string[];
}): string | undefined {
  const result = spawnSync('git', [...command.gitArguments], {
    cwd: command.repositoryRoot,
    encoding: 'utf-8',
    env: gitEnvironmentWithoutInheritedRepository(),
  });
  return result.status === 0 ? (result.stdout ?? '').trim() : undefined;
}

function iterationFolder(location: {
  readonly repositoryRoot: string;
  readonly iteration: string;
}): string {
  return join(location.repositoryRoot, ITERATIONS_DIRECTORY, location.iteration);
}

function intakeFolder(location: {
  readonly repositoryRoot: string;
  readonly iteration: string;
}): string {
  return join(iterationFolder(location), INTAKE_DIRECTORY);
}

/**
 * Lists what arrived: a folder's visible files, flat (subfolders and `README.md` are skipped and
 * reported), or one file.
 *
 * @remarks
 * Failure modes: throws when the source does not exist.
 */
export function readReceived(source: string): {
  readonly folder: string;
  readonly names: string[];
  readonly skipped: string[];
} {
  if (!existsSync(source)) throw new Error(`Source not found: ${source}`);
  if (statSync(source).isFile()) {
    const name = basename(source);
    if (name === 'README.md')
      return { folder: dirname(source), names: [], skipped: [SKIPPED_README] };
    return { folder: dirname(source), names: name.startsWith('.') ? [] : [name], skipped: [] };
  }
  const names: string[] = [];
  const skipped: string[] = [];
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory())
      skipped.push(`${entry.name}/ (the intake is flat — subfolders are not copied)`);
    else if (entry.name === 'README.md') skipped.push(SKIPPED_README);
    else if (entry.isFile()) names.push(entry.name);
  }
  names.sort((left, right) => left.localeCompare(right));
  return { folder: source, names, skipped };
}

/**
 * The Intake note: what was received versus carried forward — `<n> received` for a full drop;
 * `<n> received (<names>) · <m> carried forward from <baseline>` for an overlay or a brief, whose
 * last word is the Baseline the gate checks the snapshot was built on.
 */
export function renderIntakeNote(intake: {
  readonly mode: IntakeMode;
  readonly taken: readonly string[];
  readonly total: number;
  readonly baseline: string | undefined;
}): string {
  if (intake.mode === DEFAULT_INTAKE_MODE) return `${intake.taken.length} received`;
  return `${intake.taken.length} received (${intake.taken.join(', ')}) · ${intake.total - intake.taken.length} carried forward from ${intake.baseline}`;
}

/** `--mode <mode>` as typed on a command line (nothing for the default). */
function modeOption(mode: IntakeMode): string {
  return mode === DEFAULT_INTAKE_MODE ? '' : ` --mode ${mode}`;
}

function relativeIntakeFolder(iteration: string): string {
  return `iterations/${iteration}/${INTAKE_DIRECTORY}/`;
}

function changeKind(code: string): string {
  if (code.startsWith('A')) return 'added';
  if (code.startsWith('D')) return 'deleted';
  if (code.startsWith('R')) return 'renamed';
  return 'modified';
}

/** What git can say about how an intake folder changed, and how to restore it. */
function gitIntakeChanges(location: {
  readonly repositoryRoot: string;
  readonly iteration: string;
}): { readonly details: string[]; readonly restore: string } {
  const { repositoryRoot } = location;
  const path = relativeIntakeFolder(location.iteration);
  if (!tryGit({ repositoryRoot, gitArguments: ['ls-files', '--', path] })) {
    return {
      details: [`${path} is not committed yet, so git cannot name the changed file.`],
      restore: '',
    };
  }
  const tracked = (
    tryGit({ repositoryRoot, gitArguments: ['diff', '--name-status', 'HEAD', '--', path] }) ?? ''
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [code = '', ...paths] = line.split('\t');
      return `${changeKind(code)} ${basename(paths[0] ?? '')}`;
    });
  const untracked = (
    tryGit({
      repositoryRoot,
      gitArguments: ['ls-files', '--others', '--exclude-standard', '--', path],
    }) ?? ''
  )
    .split('\n')
    .filter(Boolean)
    .map((file) => `added ${basename(file)}`);
  const changes = [...tracked, ...untracked];
  if (changes.length === 0) {
    return {
      details: [`No uncommitted change — a commit changed it: git log --oneline -- ${path}`],
      restore: 'restore the files from the commit before that change',
    };
  }
  return {
    details: [`Uncommitted: ${changes.join(', ')}`],
    restore: `restore the delivered files (git restore --source=HEAD -- ${path}, and delete any file added since)`,
  };
}

/**
 * What the gate finds wrong with one iteration's intake — empty when it passes.
 *
 * @remarks
 * Checks: no intake yet; an unknown Intake mode; a mandatory file missing for the recorded mode; a
 * recomputed Intake hash that differs from the README's (with what git can name); an overlay or
 * brief snapshot built on another Baseline than the README records.
 *
 * Failure modes: throws when the iteration has no README.
 */
export function gateFailures(location: {
  readonly repositoryRoot: string;
  readonly iteration: string;
}): GateFailure[] {
  const { repositoryRoot, iteration } = location;
  const { fields } = readIterationReadme({ repositoryRoot, iteration });
  const folder = intakeFolder({ repositoryRoot, iteration });
  const names = flatFileNames(folder);
  if (names.length === 0) {
    return [
      {
        what: 'no intake yet',
        details: [],
        fix: `place it: pnpm iteration:intake ${iteration} <source>`,
      },
    ];
  }
  const mode = recordedIntakeMode(fields);
  const reintake =
    fields.get('Status') === 'planning'
      ? `re-run the intake: pnpm iteration:intake ${iteration} <source>${modeOption(mode)} --replace`
      : `move it back first (pnpm iteration:status ${iteration} planning --reason "<why>"), then re-run the intake with --replace`;
  const failures: GateFailure[] = [];
  const recordedMode = fields.get('Intake mode') ?? EMPTY_FIELD;
  if (!isIntakeMode(recordedMode)) {
    failures.push({
      what: `the README's Intake mode is "${recordedMode}", not ${INTAKE_MODES.join(', ')}`,
      details: [],
      fix: reintake,
    });
  }
  const { missing } = checkIntakeSet({ names, mode });
  if (missing.length > 0) {
    failures.push({
      what: `missing mandatory file(s): ${missing.join(', ')}`,
      details: [],
      fix: reintake,
    });
  }
  const recorded = fields.get('Intake hash') ?? EMPTY_FIELD;
  const actual = intakeHash(folder);
  if (actual !== recorded) {
    const { details, restore } = gitIntakeChanges({ repositoryRoot, iteration });
    failures.push({
      what: `changed since the intake — the Intake hash is ${actual}, the README records ${recorded}`,
      details,
      fix: restore === '' ? reintake : `${restore} — or, for a deliberate change, ${reintake}`,
    });
  }
  if (mode !== DEFAULT_INTAKE_MODE) {
    const builtOn = BUILT_ON.exec(fields.get('Intake note') ?? '')?.[1];
    const baseline = fields.get('Baseline') ?? EMPTY_FIELD;
    if (builtOn !== baseline) {
      failures.push({
        what: `the ${mode} snapshot was built on ${builtOn ?? 'no recorded Baseline'}, but the README's Baseline is ${baseline}`,
        details: [],
        fix: `rebuild it on ${baseline} — ${reintake}`,
      });
    }
  }
  return failures;
}

/**
 * Runs the gate, `pnpm iteration:intake <iteration> --check [--baseline <baseline>]`.
 *
 * @remarks
 * Algorithm: with a Baseline, the README's Baseline must equal it; then the iteration's intake and
 * the Baseline's each pass {@link gateFailures}. An unknown iteration is reported, not thrown.
 * Every failure names the folder, what is missing or changed and the fix; the first line of a
 * failure is "Gate failed — 1 problem." (or "— 2 problems.", and so on) followed by "Stop here: write
 * nothing, change no status.".
 *
 * Side effects: reads files and runs read-only git commands.
 */
export function runGate(request: {
  readonly repositoryRoot: string;
  readonly iteration: string;
  readonly baseline: string | undefined;
}): CommandResult {
  const { repositoryRoot, iteration, baseline } = request;
  const lines: string[] = [];
  let failed = 0;
  const exists = (name: string): boolean =>
    parseIterationName(name) !== undefined &&
    existsSync(join(iterationFolder({ repositoryRoot, iteration: name }), 'README.md'));
  if (baseline !== undefined && exists(iteration)) {
    const recorded =
      readIterationReadme({ repositoryRoot, iteration }).fields.get('Baseline') ?? EMPTY_FIELD;
    if (recorded !== baseline) {
      failed += 1;
      lines.push(
        `✗ iterations/${iteration}/README.md: the Baseline is ${recorded}, not ${baseline}`,
        `    fix: record it first: pnpm iteration:baseline ${iteration} ${baseline}`,
      );
    }
  }
  for (const name of baseline === undefined ? [iteration] : [iteration, baseline]) {
    const folder = relativeIntakeFolder(name);
    if (!exists(name)) {
      failed += 1;
      lines.push(
        `✗ iterations/${name}/: no such iteration (no README.md)`,
        '    fix: pick an existing one — pnpm iteration:list',
      );
      continue;
    }
    const failures = gateFailures({ repositoryRoot, iteration: name });
    if (failures.length === 0) {
      const { fields } = readIterationReadme({ repositoryRoot, iteration: name });
      lines.push(
        `✓ ${folder} — ${flatFileNames(intakeFolder({ repositoryRoot, iteration: name })).length} files, mandatory set complete, Intake hash ${fields.get('Intake hash')} unchanged (Intake mode ${recordedIntakeMode(fields)})`,
      );
      continue;
    }
    failed += failures.length;
    for (const failure of failures) {
      lines.push(
        `✗ ${folder}: ${failure.what}`,
        ...failure.details.map((detail) => `    ${detail}`),
        `    fix: ${failure.fix}`,
      );
    }
  }
  if (failed > 0) {
    return {
      exitCode: 1,
      lines: [
        `Gate failed — ${failed} ${failed === 1 ? 'problem' : 'problems'}. Stop here: write nothing, change no status.`,
        ...lines,
      ],
    };
  }
  return { exitCode: 0, lines: [...lines, 'Gate passed.'] };
}

/** The snapshot an overlay or a brief builds on: the README's Baseline, whose intake must pass. */
function baselineSnapshot(request: {
  readonly repositoryRoot: string;
  readonly iteration: string;
  readonly fields: ReadonlyMap<string, string>;
  readonly mode: IntakeMode;
  readonly label: string;
  readonly problems: string[];
  readonly checkGate: boolean;
}): BaselineFiles | undefined {
  const { repositoryRoot, iteration, fields, mode, label, problems } = request;
  const baseline = fields.get('Baseline') ?? EMPTY_FIELD;
  if (baseline === NO_BASELINE || baseline === EMPTY_FIELD) {
    problems.push(
      `${label}: --mode ${mode} builds on the Baseline's snapshot, and ${iteration} has Baseline ${baseline} — confirm it first: pnpm iteration:baseline ${iteration} <baseline>.`,
    );
    return undefined;
  }
  const folder = intakeFolder({ repositoryRoot, iteration: baseline });
  let failures: readonly { readonly what: string }[] = [];
  if (request.checkGate) failures = gateFailures({ repositoryRoot, iteration: baseline });
  else if (flatFileNames(folder).length === 0) failures = [{ what: 'no intake yet' }];
  if (failures.length > 0) {
    problems.push(
      ...failures.map(
        (failure) =>
          `${label}: the Baseline ${baseline} fails the gate — ${failure.what} (pnpm iteration:intake ${baseline} --check).`,
      ),
    );
    return undefined;
  }
  return {
    name: baseline,
    files: new Map(flatFileNames(folder).map((name) => [name, join(folder, name)])),
  };
}

/**
 * Builds a snapshot by mode — file name → the path it is copied from — and the names taken from
 * what came in. `full`: what came in. `overlay`: the Baseline's files with what came in laid over
 * them (at least one file). `brief`: the Baseline's files plus the `BRIEF.md` that came in; any
 * other file that came in must match the Baseline's.
 */
function buildSnapshot(request: {
  readonly mode: IntakeMode;
  readonly incoming: ReadonlyMap<string, string>;
  readonly baseline: BaselineFiles | undefined;
  readonly label: string;
  readonly problems: string[];
}): Snapshot {
  const { mode, incoming, baseline, label, problems } = request;
  const names = [...incoming.keys()];
  if (mode === DEFAULT_INTAKE_MODE || baseline === undefined)
    return { files: new Map(incoming), taken: names };
  if (mode === 'overlay') {
    if (names.length === 0)
      problems.push(`${label}: --mode overlay needs at least one received file.`);
    return { files: new Map([...baseline.files, ...incoming]), taken: names };
  }
  const files = new Map(baseline.files);
  const brief = incoming.get(BRIEF_FILE);
  if (brief === undefined) {
    problems.push(
      `${label}: --mode brief needs a received ${BRIEF_FILE} — start from ${BRIEF_TEMPLATE}.`,
    );
    return { files, taken: [] };
  }
  files.set(BRIEF_FILE, brief);
  const changed = names.filter((name) => {
    if (name === BRIEF_FILE) return false;
    const from = incoming.get(name);
    const carried = baseline.files.get(name);
    return from === undefined || carried === undefined || !sameBytes(from, carried);
  });
  if (changed.length > 0) {
    problems.push(
      `${label}: --mode brief changes only ${BRIEF_FILE}, but ${changed.join(', ')} ${changed.length === 1 ? 'differs' : 'differ'} from the Baseline ${baseline.name} — use --mode overlay when other files change.`,
    );
  }
  return { files, taken: [BRIEF_FILE] };
}

function describeChanges(changes: readonly IntakeFile[]): string {
  const named = (action: IntakeFile['action'], title: string): string[] => {
    const names = changes.filter((file) => file.action === action).map((file) => file.name);
    return names.length === 0 ? [] : [`${title} ${names.join(', ')}`];
  };
  return [
    ...named('replace', 'changed:'),
    ...named('add', 'added:'),
    ...named('remove', 'removed:'),
  ].join(' · ');
}

/**
 * Plans one repository's side: compares the snapshot with `intake-files/` file by file (add,
 * unchanged, replace, remove) and fills the README rows. Replacing a different existing snapshot
 * needs `--replace` while Status is planning; nothing changes once the intake is locked.
 */
function planSide(request: {
  readonly repositoryRoot: string;
  readonly iteration: string;
  readonly readme: {
    readonly path: string;
    readonly content: string;
    readonly fields: ReadonlyMap<string, string>;
  };
  readonly snapshot: Snapshot;
  readonly mode: IntakeMode;
  readonly note: string;
  readonly today: string;
  readonly sourceDisplay: string;
  readonly replace: boolean;
  readonly label: string;
  readonly problems: string[];
  readonly diffs: string[];
}): IntakeSide {
  const { repositoryRoot, iteration, readme, snapshot, mode, label, problems, diffs } = request;
  const status = readme.fields.get('Status') ?? '';
  const missingRows = README_FIELD_LABELS.filter((field) => !readme.fields.has(field));
  if (missingRows.length > 0) {
    problems.push(
      `${label}: README.md has no ${missingRows.join(', ')} row — it predates the field; add the rows from tooling/iterations/templates/README.md.`,
    );
  }
  const folder = intakeFolder({ repositoryRoot, iteration });
  const existing = flatFileNames(folder);
  const files: IntakeFile[] = [...snapshot.files].map(([name, from]) => {
    const to = join(folder, name);
    if (!existing.includes(name)) return { name, from, to, action: 'add' };
    return { name, from, to, action: sameBytes(from, to) ? 'unchanged' : 'replace' };
  });
  for (const name of existing) {
    if (!snapshot.files.has(name))
      files.push({ name, from: undefined, to: join(folder, name), action: 'remove' });
  }
  const changes = files.filter((file) => file.action !== 'unchanged');
  const hash = snapshotFingerprint(
    new Map([...snapshot.files].map(([name, from]) => [name, readFileSync(from)])),
  );
  const recordedDiffers =
    readme.fields.get('Intake hash') !== hash || readme.fields.get('Intake mode') !== mode;
  const replacing = existing.length > 0 && changes.length > 0;
  const locked = isIterationStatus(status) && LOCKED_INTAKE_STATUSES.has(status);
  let refused = false;
  if ((changes.length > 0 || recordedDiffers) && locked) {
    refused = true;
    problems.push(
      `${label}: the intake is locked (Status ${status}) — move it back first: pnpm iteration:status ${iteration} planning --reason "<why>".`,
    );
  } else if (replacing && !request.replace) {
    refused = true;
    problems.push(
      `${label}: ${INTAKE_DIRECTORY}/ already holds a different snapshot (${describeChanges(changes)}) — re-run with --replace (only while planning) to replace it.`,
    );
  } else if (replacing && status !== 'planning') {
    refused = true;
    problems.push(
      `${label}: --replace replaces a snapshot only while Status is planning (it is ${status}).`,
    );
  }
  if (refused) {
    for (const file of changes.filter((change) => change.action === 'replace')) {
      if (file.from === undefined) continue;
      diffs.push(
        `${label}: ${INTAKE_DIRECTORY}/${file.name} differs from the new snapshot:\n${fileDiff({ before: file.to, after: file.from })}`,
      );
    }
  }
  let filled: string | undefined;
  if ((changes.length > 0 || recordedDiffers) && missingRows.length === 0) {
    filled = readme.content;
    for (const [field, value] of [
      ['Drop placed', request.today],
      ['Drop source', request.sourceDisplay],
      ['Intake mode', mode],
      ['Intake note', request.note],
      ['Schema-routes', schemaRoutesHash(snapshot.files.get('schema-routes.md'))],
      ['Intake hash', hash],
    ] as const) {
      filled = setReadmeField({ readme: filled, label: field, value });
    }
  }
  return {
    folder,
    readmePath: readme.path,
    readme: filled,
    status,
    note: request.note,
    hash,
    files,
  };
}

/**
 * Decides everything `pnpm iteration:intake` will do, without writing anything.
 *
 * @remarks
 * Algorithm: reads what arrived ({@link readReceived}); builds the snapshot for the mode — on the
 * README's Baseline, which must pass the gate, for an overlay or a brief (the launch is always
 * `full`); checks a received `BRIEF.md` against its six sections and the snapshot against the
 * backend's mandatory set (extras are warnings); compares it with `intake-files/` file by file.
 * Under `--both` the sibling's same-named iteration (which must exist) gets a snapshot in the same
 * mode on its own Baseline, with {@link SHARED_INTAKE_FILES} (and `BRIEF.md` in brief mode) taken
 * from this snapshot.
 *
 * Failure modes: throws when the source or the iteration does not exist; every other refusal is a
 * `problems` entry, so a dry run reports all of them at once.
 *
 * Side effects: reads files and runs `git diff --no-index` for differing files; writes nothing.
 */
export function planIntake(request: {
  readonly repositoryRoot: string;
  readonly iteration: string | undefined;
  readonly source: string | undefined;
  readonly mode?: IntakeMode;
  readonly siblingRoot: string | undefined;
  readonly replace: boolean;
  readonly today?: string | undefined;
}): IntakePlan {
  const { repositoryRoot, iteration, siblingRoot, replace } = request;
  const mode = request.mode ?? DEFAULT_INTAKE_MODE;
  if (iteration === undefined || request.source === undefined) throw new Error(INTAKE_USAGE);
  const source = resolve(repositoryRoot, request.source);
  const received = readReceived(source);
  const readme = readIterationReadme({ repositoryRoot, iteration });
  const problems: string[] = [];
  const diffs: string[] = [];
  const sourceDisplay = displaySourcePath({ repositoryRoot, source });
  const base = {
    iteration,
    mode,
    source,
    sourceDisplay,
    skipped: received.skipped,
    diffs,
    problems,
  };
  const stopped = (baseline?: string): IntakePlan => ({
    ...base,
    baseline,
    local: undefined,
    sibling: undefined,
    extras: [],
  });
  if (parseIterationName(iteration)?.type === 'launch' && mode !== DEFAULT_INTAKE_MODE) {
    problems.push(
      `The launch is always --mode ${DEFAULT_INTAKE_MODE}: it has no Baseline to build on.`,
    );
    return stopped();
  }
  const label = 'This repository';
  const baseline =
    mode === DEFAULT_INTAKE_MODE
      ? undefined
      : baselineSnapshot({
          repositoryRoot,
          iteration,
          fields: readme.fields,
          mode,
          label,
          problems,
          checkGate: true,
        });
  if (mode !== DEFAULT_INTAKE_MODE && baseline === undefined) return stopped();
  const snapshot = buildSnapshot({
    mode,
    incoming: new Map(received.names.map((name) => [name, join(received.folder, name)])),
    baseline,
    label,
    problems,
  });
  const briefSections = received.names.includes(BRIEF_FILE)
    ? missingBriefSections(readFileSync(join(received.folder, BRIEF_FILE), 'utf-8'))
    : [];
  if (briefSections.length > 0) {
    problems.push(
      `${BRIEF_FILE} is missing section(s): ${briefSections.join(', ')} — start from ${BRIEF_TEMPLATE}.`,
    );
  }
  const { missing, extras } = checkIntakeSet({ names: [...snapshot.files.keys()], mode });
  if (missing.length > 0)
    problems.push(`The snapshot is missing mandatory file(s): ${missing.join(', ')}.`);

  const today = request.today ?? localDate(new Date());
  const local = planSide({
    repositoryRoot,
    iteration,
    readme,
    snapshot,
    mode,
    note: renderIntakeNote({
      mode,
      taken: snapshot.taken,
      total: snapshot.files.size,
      baseline: baseline?.name,
    }),
    today,
    sourceDisplay,
    replace,
    label,
    problems,
    diffs,
  });
  const plan: IntakePlan = { ...base, baseline: baseline?.name, local, sibling: undefined, extras };
  if (siblingRoot === undefined) return plan;

  const siblingLabel = 'Sibling repository';
  if (!existsSync(join(iterationFolder({ repositoryRoot: siblingRoot, iteration }), 'README.md'))) {
    problems.push(
      `${siblingLabel}: there is no iteration ${iteration} — open it in both first: pnpm iteration:new <type> <topic> --both.`,
    );
    return plan;
  }
  const siblingReadme = readIterationReadme({ repositoryRoot: siblingRoot, iteration });
  const siblingBaseline =
    mode === DEFAULT_INTAKE_MODE
      ? undefined
      : baselineSnapshot({
          repositoryRoot: siblingRoot,
          iteration,
          fields: siblingReadme.fields,
          mode,
          label: siblingLabel,
          problems,
          checkGate: false,
        });
  if (mode !== DEFAULT_INTAKE_MODE && siblingBaseline === undefined) return plan;
  const shared: string[] = [
    ...SHARED_INTAKE_FILES,
    ...(mode === 'brief' ? [BRIEF_FILE] : []),
  ].filter((name) => snapshot.files.has(name));
  const siblingIncoming = new Map<string, string>();
  for (const name of shared) {
    const from = snapshot.files.get(name);
    if (from !== undefined) siblingIncoming.set(name, from);
  }
  const siblingSnapshot = buildSnapshot({
    mode,
    incoming: siblingIncoming,
    baseline: siblingBaseline,
    label: siblingLabel,
    problems,
  });
  const sibling = planSide({
    repositoryRoot: siblingRoot,
    iteration,
    readme: siblingReadme,
    snapshot: siblingSnapshot,
    mode,
    note: renderIntakeNote({
      mode,
      taken: siblingSnapshot.taken,
      total: siblingSnapshot.files.size,
      baseline: siblingBaseline?.name,
    }),
    today,
    sourceDisplay,
    replace,
    label: siblingLabel,
    problems,
    diffs,
  });
  return { ...plan, sibling };
}

/**
 * Writes an intake plan: adds, replaces and removes files, then writes the filled READMEs.
 *
 * @remarks
 * Failure modes: throws without writing anything when the plan has problems.
 *
 * Side effects: changes `intake-files/` and the README in this repository and, under `--both`,
 * the sibling.
 */
export function applyIntake(plan: IntakePlan): void {
  if (plan.problems.length > 0) throw new Error(plan.problems.join('\n'));
  for (const side of [plan.local, plan.sibling]) {
    if (side === undefined) continue;
    for (const file of side.files) {
      if (file.action === 'remove') rmSync(file.to);
      else if (file.action !== 'unchanged' && file.from !== undefined) {
        mkdirSync(dirname(file.to), { recursive: true });
        copyFileSync(file.from, file.to);
      }
    }
    if (side.readme !== undefined) writeFileSync(side.readmePath, side.readme);
  }
}

function describeIntake(request: {
  readonly plan: IntakePlan;
  readonly workspace: string;
}): string[] {
  const { plan, workspace } = request;
  const sideLines = (title: string, side: IntakeSide | undefined): string[] => {
    if (side === undefined) return [];
    const count = (action: IntakeFile['action']): number =>
      side.files.filter((file) => file.action === action).length;
    return [
      `${title} (${relative(workspace, side.folder)}) — Status ${side.status}: ${count('add')} new, ${count('replace')} replaced, ${count('remove')} removed, ${count('unchanged')} unchanged`,
      `  Intake note: ${side.note} · Intake hash: ${side.hash}`,
    ];
  };
  return [
    `Drop: ${plan.sourceDisplay} · --mode ${plan.mode}${plan.baseline === undefined ? '' : ` on ${plan.baseline}`}`,
    ...sideLines('This repository', plan.local),
    ...sideLines('Sibling repository', plan.sibling),
    ...plan.skipped.map((entry) => `  skipped ${entry}`),
    ...plan.extras.map((name) => `! extra file (not in the required or optional set): ${name}`),
    ...plan.diffs,
    ...plan.problems.map((problem) => `✗ ${problem}`),
  ];
}

/**
 * Runs `pnpm iteration:intake` — an intake, or the gate with `--check` — and returns what to print.
 *
 * @remarks
 * Failure modes: a non-zero exit code when anything stops the intake or the gate fails; argument
 * errors throw.
 *
 * Side effects: writes the snapshot and READMEs unless it is a dry run, the gate, or stopped.
 */
export function runIntake(request: {
  readonly commandLine: readonly string[];
  readonly repositoryRoot: string;
  readonly resolveSibling: (siblingPath: string | undefined) => string;
  readonly today?: string | undefined;
}): CommandResult {
  const options = parseIntakeArguments(request.commandLine);
  if (options.help) return { exitCode: 0, lines: [INTAKE_USAGE] };
  const { repositoryRoot } = request;
  if (options.check) {
    if (options.iteration === undefined) return { exitCode: 1, lines: [INTAKE_USAGE] };
    return runGate({ repositoryRoot, iteration: options.iteration, baseline: options.baseline });
  }
  if (options.source === undefined) return { exitCode: 1, lines: [INTAKE_USAGE] };
  const plan = planIntake({
    repositoryRoot,
    iteration: options.iteration,
    source: options.source,
    mode: options.mode,
    siblingRoot: options.createInSibling ? request.resolveSibling(options.siblingPath) : undefined,
    replace: options.replace,
    today: request.today,
  });
  const lines = describeIntake({ plan, workspace: resolve(repositoryRoot, '..') });
  if (plan.problems.length > 0) return { exitCode: 1, lines: [...lines, 'Nothing written.'] };
  if (options.dryRun)
    return { exitCode: 0, lines: ['Dry run — nothing written; the snapshot passes.', ...lines] };
  applyIntake(plan);
  return {
    exitCode: 0,
    lines: [
      'Placed.',
      ...lines,
      `Next: say "plan iteration ${plan.iteration}" — planning runs the gate first: pnpm iteration:intake ${plan.iteration} --check`,
    ],
  };
}
