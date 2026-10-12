/**
 * Design-iteration model behind the `pnpm iteration:*` commands: naming, the README field table and
 * its History, the Status lifecycle, the Baseline suggestion, the generator and the listing.
 *
 * An iteration is a folder `iterations/<type>-<topic>-<YYYY-MM-DD>-<id>/`; the rules live in
 * `iterations/README.md`. The sibling (frontend) repository ships the same commands, names and
 * README template, so a folder created in either repository looks the same in both.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gitEnvironmentWithoutInheritedRepository } from '@tooling/setup/common/git-environment.js';

/** The four iteration types, in the order the docs list them. */
export const ITERATION_TYPES = ['launch', 'feat', 'change', 'fix'] as const;

/** One of {@link ITERATION_TYPES}. */
export type IterationType = (typeof ITERATION_TYPES)[number];

/** Folder (relative to a repository root) that holds every iteration. */
export const ITERATIONS_DIRECTORY = 'iterations';

/** Folder inside an iteration holding the files received from outside, exactly as delivered. */
export const INTAKE_DIRECTORY = 'intake-files';

/** README Status values, in lifecycle order. */
export const ITERATION_STATUSES = [
  'planning',
  'ready-for-approval',
  'approved',
  'implementing',
  'done',
  'frozen',
] as const;

/** One of {@link ITERATION_STATUSES}. */
export type IterationStatus = (typeof ITERATION_STATUSES)[number];

/** Status a freshly opened iteration starts in. */
export const INITIAL_ITERATION_STATUS: IterationStatus = 'planning';

/** Statuses from which the intake is locked (the approved plan rests on it). */
export const LOCKED_INTAKE_STATUSES: ReadonlySet<IterationStatus> = new Set([
  'approved',
  'implementing',
  'done',
  'frozen',
]);

/** Statuses an iteration must have to be suggested as another iteration's Baseline. */
const BASELINE_STATUSES: ReadonlySet<string> = new Set(['done', 'frozen']);

/** Baseline of an initial iteration — the first one in a repository. */
export const NO_BASELINE = 'none';

/** Placeholder for an empty README field. */
export const EMPTY_FIELD = '—';

/** Maximum random suffixes tried before giving up on a unique name. */
export const MAXIMUM_NAME_ATTEMPTS = 20;

/** Files every drop for this (backend) repository must contain. */
export const REQUIRED_INTAKE_FILES = ['PRD.md', 'schema-routes.md'] as const;

/** Intake modes: how the snapshot in `intake-files/` was built from what arrived. */
export const INTAKE_MODES = ['full', 'overlay', 'brief'] as const;

/** One of {@link INTAKE_MODES}. */
export type IntakeMode = (typeof INTAKE_MODES)[number];

/** The mode when none is given — and always the launch's: the drop as received. */
export const DEFAULT_INTAKE_MODE: IntakeMode = 'full';

/** The written change a `brief` intake receives instead of design files. */
export const BRIEF_FILE = 'BRIEF.md';

/** The `## ` sections every `BRIEF.md` must have ("none" is an answer; a missing section is not). */
export const BRIEF_SECTIONS = [
  'What changes',
  'Why',
  'Affected screens, entities and routes',
  'Rules',
  'Acceptance criteria',
  'Out of scope',
] as const;

/** Files a backend snapshot may hold besides the required ones (a carried-forward brief included). */
export const OPTIONAL_INTAKE_FILES = ['design-overview.md', BRIEF_FILE] as const;

/** Files `--both` copies into the sibling repository's same-named iteration. */
export const SHARED_INTAKE_FILES = ['PRD.md', 'schema-routes.md'] as const;

/** Hex characters kept of a sha256 fingerprint — Schema-routes and Intake hash (both repositories). */
export const FINGERPRINT_LENGTH = 12;

/** README field labels, in table order — the template must list exactly these rows. */
export const README_FIELD_LABELS = [
  'Type',
  'Topic',
  'Owner',
  'Opened',
  'Branch',
  'Baseline',
  'Status',
  'Summary',
  'Drop placed',
  'Drop source',
  'Intake mode',
  'Intake note',
  'Schema-routes',
  'Intake hash',
] as const;

/** One of {@link README_FIELD_LABELS}. */
export type ReadmeFieldLabel = (typeof README_FIELD_LABELS)[number];

const TEMPLATES_DIRECTORY = join(import.meta.dirname, 'templates');
const TOPIC_PATTERN = /^[a-z]+(?:-[a-z]+)*$/;
const ITERATION_NAME_PATTERN =
  /^(launch|feat|change|fix)(?:-([a-z]+(?:-[a-z]+)*))?-(\d{4}-\d{2}-\d{2})-([a-z]{4})$/;
const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const SUFFIX_LENGTH = 4;
const TEMPLATE_PLACEHOLDER = /\{\{(\w+)\}\}/g;
const README_ROW = /^\|\s*([A-Za-z][A-Za-z -]*?)\s*\|\s*(.*?)\s*\|\s*$/;
const HISTORY_HEADING = '## History';
const SIBLING_SUFFIXES: Readonly<Record<string, string>> = { '-be': '-fe', '-fe': '-be' };

/** Forward Status moves: one step along the lifecycle at a time. */
const FORWARD_TRANSITIONS: ReadonlyMap<IterationStatus, IterationStatus> = new Map([
  ['planning', 'ready-for-approval'],
  ['ready-for-approval', 'approved'],
  ['approved', 'implementing'],
  ['implementing', 'done'],
  ['done', 'frozen'],
]);

/**
 * Statuses that may move back to `planning` — only with a reason. `done` is among them: work the
 * user finds still open goes back into the same iteration until it is `frozen` (merged); a frozen
 * iteration is never edited.
 */
const BACK_TO_PLANNING: ReadonlySet<IterationStatus> = new Set([
  'ready-for-approval',
  'approved',
  'implementing',
  'done',
]);

/** The values of an iteration's `README.md` field table, keyed for the template. */
export interface IterationReadmeFields {
  readonly type: string;
  readonly topic: string;
  readonly owner: string;
  readonly opened: string;
  readonly branch: string;
  readonly baseline: string;
  readonly status: string;
  readonly summary: string;
  readonly dropPlaced: string;
  readonly dropSource: string;
  readonly intakeMode: string;
  readonly intakeNote: string;
  readonly schemaRoutes: string;
  readonly intakeHash: string;
}

/** One row of `pnpm iteration:list`. */
export interface IterationListing {
  readonly name: string;
  readonly type: string;
  readonly owner: string;
  readonly opened: string;
  readonly baseline: string;
  readonly status: string;
  readonly intakeMode: string;
  /** Live fingerprint of `intake-files/schema-routes.md` ({@link schemaRoutesHash}). */
  readonly schemaRoutes: string;
  /** Live {@link intakeHash}; `<live> ≠ README <recorded>` when it differs from the README's. */
  readonly intakeHash: string;
  readonly dropPlaced: string;
}

/** Parsed `pnpm iteration:new` command line. */
export interface NewIterationArguments {
  readonly type: string | undefined;
  readonly topic: string | undefined;
  readonly createInSibling: boolean;
  readonly siblingPath: string | undefined;
  readonly dryRun: boolean;
  readonly help: boolean;
}

/** A file a command will write, with its absolute path. */
export interface PlannedFile {
  readonly path: string;
  readonly content: string;
}

/** Everything `pnpm iteration:new` decided, before anything touches the disk. */
export interface NewIterationPlan {
  readonly name: string;
  readonly fields: IterationReadmeFields;
  readonly localFolder: string;
  readonly siblingFolder: string | undefined;
  /** The sibling README's Baseline — suggested from the sibling's own iterations. */
  readonly siblingBaseline: string | undefined;
  readonly files: readonly PlannedFile[];
}

/** Input to {@link planNewIteration}. */
export interface NewIterationRequest {
  readonly repositoryRoot: string;
  readonly baseBranch: string;
  readonly type: string | undefined;
  readonly topic: string | undefined;
  /** Absolute path of the sibling repository when `--both` is passed. */
  readonly siblingRoot: string | undefined;
  /** `YYYY-MM-DD`; defaults to today's local date. */
  readonly today?: string;
  /** Source of random suffixes; injectable so tests can force a collision. */
  readonly nextSuffix?: () => string;
}

/** Everything a README-writing command decided, before the README is written. */
export interface ReadmeChangePlan {
  readonly readmePath: string;
  readonly from: string;
  readonly to: string;
  readonly historyEntry: string;
  readonly content: string;
}

// ── arguments ────────────────────────────────────────────────────────────────

/**
 * Parses `pnpm iteration:new` arguments: `<type> [topic] [--both] [--sibling <path>] [--dry-run]`.
 *
 * @remarks
 * Failure modes: throws on an unknown flag, a `--sibling` without a path, or a third positional.
 * `--sibling` implies `--both`.
 */
export function parseNewIterationArguments(commandLine: readonly string[]): NewIterationArguments {
  const positionals: string[] = [];
  let createInSibling = false;
  let siblingPath: string | undefined;
  let dryRun = false;
  let help = false;
  for (let index = 0; index < commandLine.length; index += 1) {
    const token = commandLine[index] ?? '';
    if (token === '--both') createInSibling = true;
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
    throw new Error(`Too many arguments: ${positionals.join(' ')} — expected <type> [topic].`);
  }
  return {
    type: positionals[0],
    topic: positionals[1],
    createInSibling,
    siblingPath,
    dryRun,
    help,
  };
}

// ── names ────────────────────────────────────────────────────────────────────

/** Returns whether `value` is one of {@link ITERATION_TYPES}. */
export function isIterationType(value: string): value is IterationType {
  return (ITERATION_TYPES as readonly string[]).includes(value);
}

/**
 * Checks the type and topic of a new iteration and returns them narrowed.
 *
 * @remarks
 * Failure modes: throws when the type is unknown, a launch is given a topic, any other type has
 * no topic, or the topic is not lowercase kebab-case words without digits.
 */
export function validateTypeAndTopic(request: {
  readonly type: string | undefined;
  readonly topic: string | undefined;
}): { readonly type: IterationType; readonly topic: string | undefined } {
  const { type, topic } = request;
  if (type === undefined || !isIterationType(type)) {
    throw new Error(
      `Unknown type "${type ?? ''}" — use ${ITERATION_TYPES.join(', ')}. Usage: pnpm iteration:new <type> [topic]`,
    );
  }
  if (type === 'launch') {
    if (topic !== undefined) throw new Error('launch takes no topic: pnpm iteration:new launch');
    return { type, topic: undefined };
  }
  if (topic === undefined) {
    throw new Error(`${type} needs a topic, e.g. pnpm iteration:new ${type} pharmacy-returns`);
  }
  if (!TOPIC_PATTERN.test(topic)) {
    throw new Error(
      `Topic "${topic}" must be lowercase kebab-case words with no digits (e.g. pharmacy-returns).`,
    );
  }
  return { type, topic };
}

/** Builds `<type>-<topic>-<YYYY-MM-DD>-<suffix>` (no topic segment for a launch). */
export function buildIterationName(parts: {
  readonly type: IterationType;
  readonly topic: string | undefined;
  readonly opened: string;
  readonly suffix: string;
}): string {
  const topicSegment = parts.topic === undefined ? '' : `-${parts.topic}`;
  return `${parts.type}${topicSegment}-${parts.opened}-${parts.suffix}`;
}

/** Splits an iteration folder name into its parts, or returns `undefined` when it is not one. */
export function parseIterationName(
  name: string,
):
  | { readonly type: IterationType; readonly topic: string | undefined; readonly opened: string }
  | undefined {
  const match = ITERATION_NAME_PATTERN.exec(name);
  if (!match) return undefined;
  const [, type, topic, opened] = match;
  if (type === undefined || opened === undefined || !isIterationType(type)) return undefined;
  return { type, topic, opened };
}

/** Returns four random lowercase letters — the `<id>` that keeps names unique across people. */
export function randomIterationSuffix(): string {
  let suffix = '';
  for (let position = 0; position < SUFFIX_LENGTH; position += 1) {
    suffix += SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)];
  }
  return suffix;
}

/** Formats a date as local `YYYY-MM-DD` — the day as the person running the command sees it. */
export function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// ── README ───────────────────────────────────────────────────────────────────

/**
 * Fills `{{placeholder}}` slots in a template.
 *
 * @remarks
 * Failure modes: throws when the template names a placeholder that `values` does not supply, so a
 * renamed field can never ship as a literal `{{field}}`.
 */
export function renderTemplate(source: {
  readonly template: string;
  readonly values: Readonly<Record<string, string>>;
}): string {
  return source.template.replace(TEMPLATE_PLACEHOLDER, (_placeholder, key: string) => {
    const value = source.values[key];
    if (value === undefined) throw new Error(`Template placeholder {{${key}}} has no value.`);
    return value;
  });
}

/** Reads a template from `tooling/iterations/templates/`. */
export function readIterationTemplate(relativePath: string): string {
  return readFileSync(join(TEMPLATES_DIRECTORY, relativePath), 'utf-8');
}

/** Renders an iteration's `README.md` from the README template. */
export function renderIterationReadme(readme: {
  readonly name: string;
  readonly fields: IterationReadmeFields;
}): string {
  return renderTemplate({
    template: readIterationTemplate('README.md'),
    values: { name: readme.name, ...readme.fields },
  });
}

/**
 * Reads the field table of an iteration's `README.md` into a label → value map.
 *
 * @remarks
 * Only two-cell `| Label | Value |` rows count, where the label is words (letters, spaces,
 * hyphens); the header row and separator are skipped.
 */
export function parseIterationReadme(markdown: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const line of markdown.split('\n')) {
    const match = README_ROW.exec(line.trim());
    if (!match) continue;
    const [, label, value] = match;
    if (label === undefined || value === undefined || label === 'Field') continue;
    if (value.includes('|')) continue;
    fields.set(label, value);
  }
  return fields;
}

/**
 * Sets one row of a README field table, keeping every other line as it is.
 *
 * @remarks
 * Failure modes: throws when the README has no `| <label> | … |` row.
 */
export function setReadmeField(update: {
  readonly readme: string;
  readonly label: ReadmeFieldLabel;
  readonly value: string;
}): string {
  const row = new RegExp(`^\\|\\s*${update.label}\\s*\\|.*\\|\\s*$`, 'm');
  if (!row.test(update.readme)) {
    throw new Error(`The README has no "| ${update.label} | … |" row.`);
  }
  return update.readme.replace(row, `| ${update.label} | ${update.value} |`);
}

/** Formats one History line: `- <date> · <change> · <reason or —> · <who>`. */
export function renderHistoryEntry(entry: {
  readonly date: string;
  /** `<from> → <to>` for a Status move; `Baseline <from> → <to>` for a Baseline change. */
  readonly change: string;
  readonly reason: string | undefined;
  readonly owner: string;
}): string {
  const reason = entry.reason?.replace(/\s+/g, ' ') ?? EMPTY_FIELD;
  return `- ${entry.date} · ${entry.change} · ${reason} · ${entry.owner}`;
}

/**
 * Appends a line to the README's `## History` list.
 *
 * @remarks
 * Algorithm: the line goes at the end of the History section — after its last line, before the
 * next `## ` section if one follows; the section is created at the end of the file when missing.
 */
export function appendHistoryEntry(update: {
  readonly readme: string;
  readonly historyEntry: string;
}): string {
  const lines = update.readme.replace(/\s+$/, '').split('\n');
  const headingIndex = lines.findIndex((line) => line.trim() === HISTORY_HEADING);
  if (headingIndex === -1) {
    return `${[...lines, '', HISTORY_HEADING, '', update.historyEntry].join('\n')}\n`;
  }
  const nextSection = lines.findIndex(
    (line, index) => index > headingIndex && line.startsWith('## '),
  );
  const sectionEnd = nextSection === -1 ? lines.length : nextSection;
  let insertAt = sectionEnd;
  while (insertAt > headingIndex + 1 && (lines[insertAt - 1] ?? '').trim() === '') insertAt -= 1;
  const entryLines =
    insertAt === headingIndex + 1 ? ['', update.historyEntry] : [update.historyEntry];
  lines.splice(insertAt, 0, ...entryLines);
  return `${lines.join('\n')}\n`;
}

/** Path of an iteration's README. */
export function iterationReadmePath(location: {
  readonly repositoryRoot: string;
  readonly iteration: string;
}): string {
  return join(location.repositoryRoot, ITERATIONS_DIRECTORY, location.iteration, 'README.md');
}

/**
 * Reads an iteration's README after checking the name and the file.
 *
 * @remarks
 * Failure modes: throws when the name is not an iteration name or the README is missing.
 */
export function readIterationReadme(location: {
  readonly repositoryRoot: string;
  readonly iteration: string;
}): {
  readonly path: string;
  readonly content: string;
  readonly fields: ReadonlyMap<string, string>;
} {
  const path = iterationReadmePath(location);
  if (parseIterationName(location.iteration) === undefined || !existsSync(path)) {
    throw new Error(
      `No iteration "${location.iteration}" with a README — see pnpm iteration:list.`,
    );
  }
  const content = readFileSync(path, 'utf-8');
  return { path, content, fields: parseIterationReadme(content) };
}

// ── git ──────────────────────────────────────────────────────────────────────

function runGit(command: {
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

function tryGit(command: {
  readonly repositoryRoot: string;
  readonly gitArguments: readonly string[];
}): string | undefined {
  try {
    return runGit(command);
  } catch {
    return undefined;
  }
}

/**
 * Reads `git config user.name` — who signs History lines and owns new iterations.
 *
 * @remarks
 * Failure modes: throws when it is not set.
 */
export function gitUserName(repositoryRoot: string): string {
  const owner = tryGit({ repositoryRoot, gitArguments: ['config', 'user.name'] }) ?? '';
  if (owner === '') throw new Error('git config user.name is not set — it signs the README.');
  return owner;
}

// ── iterations on disk ───────────────────────────────────────────────────────

/** Iteration folder names present in a repository's working tree. */
export function workingTreeIterationNames(repositoryRoot: string): string[] {
  const directory = join(repositoryRoot, ITERATIONS_DIRECTORY);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && parseIterationName(entry.name) !== undefined)
    .map((entry) => entry.name)
    .sort();
}

/** Iteration folder names committed on `baseBranch` (empty when the branch does not exist). */
export function baseBranchIterationNames(location: {
  readonly repositoryRoot: string;
  readonly baseBranch: string;
}): string[] {
  const listing = tryGit({
    repositoryRoot: location.repositoryRoot,
    gitArguments: [
      'ls-tree',
      '-d',
      '--name-only',
      location.baseBranch,
      '--',
      `${ITERATIONS_DIRECTORY}/`,
    ],
  });
  if (!listing) return [];
  return listing
    .split('\n')
    .map((path) => path.slice(ITERATIONS_DIRECTORY.length + 1))
    .filter((name) => parseIterationName(name) !== undefined)
    .sort();
}

/** Reads every working-tree iteration's README fields (an iteration without a README maps empty). */
export function readAllIterationFields(
  repositoryRoot: string,
): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const all = new Map<string, ReadonlyMap<string, string>>();
  for (const name of workingTreeIterationNames(repositoryRoot)) {
    const path = iterationReadmePath({ repositoryRoot, iteration: name });
    all.set(
      name,
      existsSync(path)
        ? parseIterationReadme(readFileSync(path, 'utf-8'))
        : new Map<string, string>(),
    );
  }
  return all;
}

/**
 * Lists the required intake files an iteration's `intake-files/` lacks — empty when complete.
 *
 * @remarks
 * An incremental iteration's delta is a diff of `intake-files/` against its Baseline's, so a
 * Baseline is usable only when this is empty.
 */
export function missingIntakeFiles(location: {
  readonly repositoryRoot: string;
  readonly iteration: string;
}): string[] {
  const folder = join(
    location.repositoryRoot,
    ITERATIONS_DIRECTORY,
    location.iteration,
    INTAKE_DIRECTORY,
  );
  return REQUIRED_INTAKE_FILES.filter((name) => !existsSync(join(folder, name)));
}

/** The date of the last History line that moved an iteration to `done` (or `frozen`), if any. */
function finishedDate(readme: string): string {
  let finished = '';
  for (const line of readme.split('\n')) {
    const match = /^- (\d{4}-\d{2}-\d{2}) · \S+ → (done|frozen) · /.exec(line.trim());
    if (match?.[1] && match[1] > finished) finished = match[1];
  }
  return finished;
}

/**
 * Suggests a Baseline: the latest `done` or `frozen` iteration in this repository.
 *
 * @remarks
 * Algorithm: among working-tree iterations whose Status is `done` or `frozen` and whose
 * `intake-files/` holds the required set (excluding `excluding`), the one that finished last — the latest History date moving it to `done` or
 * `frozen`, then the latest Opened, then the name. The user confirms or picks another at planning
 * Step 0 (`pnpm iteration:baseline`).
 *
 * Failure modes: returns `undefined` when no iteration is done or frozen.
 */
export function suggestBaseline(location: {
  readonly repositoryRoot: string;
  readonly excluding?: string;
}): string | undefined {
  const candidates: Array<{ name: string; finished: string; opened: string }> = [];
  for (const [name, fields] of readAllIterationFields(location.repositoryRoot)) {
    if (name === location.excluding || !BASELINE_STATUSES.has(fields.get('Status') ?? '')) continue;
    if (
      missingIntakeFiles({ repositoryRoot: location.repositoryRoot, iteration: name }).length > 0
    ) {
      continue;
    }
    const readme = readFileSync(
      iterationReadmePath({ repositoryRoot: location.repositoryRoot, iteration: name }),
      'utf-8',
    );
    candidates.push({
      name,
      finished: finishedDate(readme),
      opened: fields.get('Opened') ?? parseIterationName(name)?.opened ?? '',
    });
  }
  candidates.sort(
    (left, right) =>
      right.finished.localeCompare(left.finished) ||
      right.opened.localeCompare(left.opened) ||
      right.name.localeCompare(left.name),
  );
  return candidates[0]?.name;
}

/**
 * Fingerprints a `schema-routes.md`: the first {@link FINGERPRINT_LENGTH} hex characters of the
 * sha256 of its bytes, or {@link EMPTY_FIELD} when the file is missing.
 *
 * @remarks
 * The same file is copied byte-for-byte into the frontend and backend repositories, so equal
 * fingerprints in both repositories' `pnpm iteration:list` mean the two copies match.
 */
export function schemaRoutesHash(path: string | undefined): string {
  if (path === undefined || !existsSync(path)) return EMPTY_FIELD;
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, FINGERPRINT_LENGTH);
}

/** The flat, visible files of a folder (no subfolders, no dotfiles), in `localeCompare` order. */
export function flatFileNames(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

/** Reads a folder's flat, visible files into file name → bytes. */
export function readSnapshot(folder: string): ReadonlyMap<string, Buffer> {
  return new Map(flatFileNames(folder).map((name) => [name, readFileSync(join(folder, name))]));
}

function byCodeUnit(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * Fingerprints a whole snapshot — the Intake hash.
 *
 * @remarks
 * Algorithm (identical in both repositories): one sha256 over every file, names in code-unit
 * order (not `localeCompare`), each fed as its name, a NUL, its bytes and a NUL; the hex digest's
 * first {@link FINGERPRINT_LENGTH} characters. {@link EMPTY_FIELD} for an empty snapshot. Any added,
 * removed, renamed or edited file changes it.
 */
export function snapshotFingerprint(files: ReadonlyMap<string, Buffer>): string {
  if (files.size === 0) return EMPTY_FIELD;
  const hash = createHash('sha256');
  for (const name of [...files.keys()].sort(byCodeUnit)) {
    hash.update(name);
    hash.update('\0');
    hash.update(files.get(name) ?? Buffer.alloc(0));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, FINGERPRINT_LENGTH);
}

/** The Intake hash of a folder as it is on disk ({@link snapshotFingerprint}). */
export function intakeHash(folder: string): string {
  return snapshotFingerprint(readSnapshot(folder));
}

/** The `## ` sections of {@link BRIEF_SECTIONS} a `BRIEF.md` lacks. */
export function missingBriefSections(markdown: string): string[] {
  const headings = new Set(
    markdown
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3).trim()),
  );
  return BRIEF_SECTIONS.filter((section) => !headings.has(section));
}

/** Returns whether `value` is one of {@link INTAKE_MODES}. */
export function isIntakeMode(value: string): value is IntakeMode {
  return (INTAKE_MODES as readonly string[]).includes(value);
}

/** The Intake mode a README records — `full` when the row is missing or not a known mode. */
export function recordedIntakeMode(fields: ReadonlyMap<string, string>): IntakeMode {
  const mode = fields.get('Intake mode') ?? '';
  return isIntakeMode(mode) ? mode : DEFAULT_INTAKE_MODE;
}

/**
 * Checks a backend snapshot against the mandatory set: {@link REQUIRED_INTAKE_FILES}, plus
 * `BRIEF.md` in `brief` mode. {@link OPTIONAL_INTAKE_FILES} are allowed; anything else is an extra.
 */
export function checkIntakeSet(snapshot: {
  readonly names: readonly string[];
  readonly mode?: IntakeMode;
}): { readonly missing: string[]; readonly extras: string[] } {
  const present = new Set(snapshot.names);
  const required: string[] = [
    ...REQUIRED_INTAKE_FILES,
    ...(snapshot.mode === 'brief' ? [BRIEF_FILE] : []),
  ];
  const known = new Set<string>([...required, ...OPTIONAL_INTAKE_FILES]);
  return {
    missing: required
      .filter((name) => !present.has(name))
      .sort((left, right) => left.localeCompare(right)),
    extras: snapshot.names.filter((name) => !known.has(name)),
  };
}

// ── sibling repository ──────────────────────────────────────────────────────

/** Maps a package name to its sibling's (`acme-be` ↔ `acme-fe`). */
export function siblingPackageName(packageName: string): string {
  for (const [suffix, siblingSuffix] of Object.entries(SIBLING_SUFFIXES)) {
    if (packageName.endsWith(suffix)) {
      return `${packageName.slice(0, -suffix.length)}${siblingSuffix}`;
    }
  }
  throw new Error(
    `package.json name "${packageName}" does not end in -be or -fe — pass --sibling <path>.`,
  );
}

/**
 * Resolves and checks the sibling repository for `--both`.
 *
 * @remarks
 * Algorithm: `--sibling <path>` wins (resolved against the repository root); otherwise the sibling
 * is `../<name>` with this repository's `package.json` name mapped `-be` ↔ `-fe`.
 *
 * Failure modes: throws when the folder has no `package.json`, so a typo never writes into a
 * stray folder somewhere else on disk.
 */
export function resolveSiblingRoot(location: {
  readonly repositoryRoot: string;
  readonly siblingPath: string | undefined;
}): string {
  const { repositoryRoot, siblingPath } = location;
  let siblingRoot: string;
  if (siblingPath === undefined) {
    const packageJson = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf-8')) as {
      name?: string;
    };
    siblingRoot = resolve(repositoryRoot, '..', siblingPackageName(packageJson.name ?? ''));
  } else {
    siblingRoot = resolve(repositoryRoot, siblingPath);
  }
  if (!existsSync(join(siblingRoot, 'package.json'))) {
    throw new Error(
      `Sibling repository not found at ${siblingRoot} — clone it there or pass --sibling <path>.`,
    );
  }
  return siblingRoot;
}

// ── iteration:new ───────────────────────────────────────────────────────────

function pickUniqueName(choice: {
  readonly type: IterationType;
  readonly topic: string | undefined;
  readonly opened: string;
  readonly takenNames: ReadonlySet<string>;
  readonly folderExists: (name: string) => boolean;
  readonly nextSuffix: () => string;
}): string {
  for (let attempt = 0; attempt < MAXIMUM_NAME_ATTEMPTS; attempt += 1) {
    const name = buildIterationName({ ...choice, suffix: choice.nextSuffix() });
    if (!(choice.takenNames.has(name) || choice.folderExists(name))) return name;
  }
  throw new Error(`No free iteration name after ${MAXIMUM_NAME_ATTEMPTS} attempts — run it again.`);
}

function suggestedBaselineFor(location: {
  readonly repositoryRoot: string;
  readonly type: IterationType;
}): string {
  if (location.type === 'launch') return NO_BASELINE;
  return suggestBaseline({ repositoryRoot: location.repositoryRoot }) ?? EMPTY_FIELD;
}

/**
 * Decides everything `pnpm iteration:new` will do, without writing anything.
 *
 * @remarks
 * Algorithm: validate type + topic; collect existing iterations (this working tree, the base
 * branch, and the sibling's working tree under `--both`); refuse a second launch and refuse any
 * non-launch before an iteration exists; pick a name with a fresh random suffix, retrying while it
 * is taken; suggest each repository's Baseline from its own iterations ({@link suggestBaseline};
 * `none` for the launch, `—` when nothing is done yet — the user confirms it at planning Step 0);
 * read Owner and Branch from git; render the README for this repository and, under `--both`, the
 * sibling. An iteration starts with its README only — `iteration:intake` fills `intake-files/`.
 *
 * Failure modes: throws with a message meant for the terminal on any refusal, a missing
 * `user.name`, or a detached HEAD.
 *
 * Side effects: runs read-only git commands; writes nothing (see {@link writePlannedFiles}).
 */
export function planNewIteration(request: NewIterationRequest): NewIterationPlan {
  const { repositoryRoot, baseBranch, siblingRoot } = request;
  const { type, topic } = validateTypeAndTopic(request);

  const localNames = workingTreeIterationNames(repositoryRoot);
  const baseNames = baseBranchIterationNames({ repositoryRoot, baseBranch });
  const siblingNames = siblingRoot === undefined ? [] : workingTreeIterationNames(siblingRoot);
  const knownNames = new Set([...localNames, ...baseNames, ...siblingNames]);

  const existingLaunch = [...knownNames].find(
    (name) => parseIterationName(name)?.type === 'launch',
  );
  if (type === 'launch' && existingLaunch !== undefined) {
    throw new Error(
      `A launch already exists (${existingLaunch}) — there is only ever one launch; open a feat, change or fix instead.`,
    );
  }
  if (type !== 'launch' && localNames.length + baseNames.length === 0) {
    throw new Error('No iteration exists yet — open the launch first: pnpm iteration:new launch');
  }

  const opened = request.today ?? localDate(new Date());
  const name = pickUniqueName({
    type,
    topic,
    opened,
    takenNames: knownNames,
    folderExists: (candidate) =>
      existsSync(join(repositoryRoot, ITERATIONS_DIRECTORY, candidate)) ||
      (siblingRoot !== undefined && existsSync(join(siblingRoot, ITERATIONS_DIRECTORY, candidate))),
    nextSuffix: request.nextSuffix ?? randomIterationSuffix,
  });

  const owner = gitUserName(repositoryRoot);
  const branch = tryGit({ repositoryRoot, gitArguments: ['branch', '--show-current'] }) ?? '';
  if (branch === '') {
    throw new Error('HEAD is detached — check out the branch this iteration will be built on.');
  }

  const fields: IterationReadmeFields = {
    type,
    topic: topic ?? EMPTY_FIELD,
    owner,
    opened,
    branch,
    baseline: suggestedBaselineFor({ repositoryRoot, type }),
    status: INITIAL_ITERATION_STATUS,
    summary: EMPTY_FIELD,
    dropPlaced: EMPTY_FIELD,
    dropSource: EMPTY_FIELD,
    intakeMode: EMPTY_FIELD,
    intakeNote: EMPTY_FIELD,
    schemaRoutes: EMPTY_FIELD,
    intakeHash: EMPTY_FIELD,
  };
  const localFolder = join(repositoryRoot, ITERATIONS_DIRECTORY, name);
  const siblingFolder =
    siblingRoot === undefined ? undefined : join(siblingRoot, ITERATIONS_DIRECTORY, name);
  const siblingBaseline =
    siblingRoot === undefined
      ? undefined
      : suggestedBaselineFor({ repositoryRoot: siblingRoot, type });
  return {
    name,
    fields,
    localFolder,
    siblingFolder,
    siblingBaseline,
    files: [
      { path: join(localFolder, 'README.md'), content: renderIterationReadme({ name, fields }) },
      ...(siblingFolder === undefined
        ? []
        : [
            {
              path: join(siblingFolder, 'README.md'),
              content: renderIterationReadme({
                name,
                fields: { ...fields, baseline: siblingBaseline ?? EMPTY_FIELD },
              }),
            },
          ]),
    ],
  };
}

/**
 * Writes planned files, refusing to overwrite.
 *
 * @remarks
 * Failure modes: throws if any planned file already exists, before writing any of them.
 *
 * Side effects: creates the folders and files.
 */
export function writePlannedFiles(files: readonly PlannedFile[]): void {
  const existing = files.find((file) => existsSync(file.path));
  if (existing !== undefined) throw new Error(`${existing.path} already exists — not overwriting.`);
  for (const file of files) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content);
  }
}

// ── iteration:list ──────────────────────────────────────────────────────────

/** Reads every `iterations/*\/README.md` in a working tree into list rows, oldest first. */
export function readIterationListings(repositoryRoot: string): IterationListing[] {
  return [...readAllIterationFields(repositoryRoot)]
    .map(([name, fields]) => {
      const field = (label: ReadmeFieldLabel): string => fields.get(label) ?? EMPTY_FIELD;
      const folder = join(repositoryRoot, ITERATIONS_DIRECTORY, name, INTAKE_DIRECTORY);
      const liveHash = intakeHash(folder);
      return {
        name,
        type: field('Type'),
        owner: field('Owner'),
        opened: field('Opened'),
        baseline: field('Baseline'),
        status: field('Status'),
        intakeMode: field('Intake mode'),
        schemaRoutes: schemaRoutesHash(join(folder, 'schema-routes.md')),
        intakeHash:
          liveHash === field('Intake hash')
            ? liveHash
            : `${liveHash} ≠ README ${field('Intake hash')}`,
        dropPlaced: field('Drop placed'),
      };
    })
    .sort(
      (left, right) =>
        left.opened.localeCompare(right.opened) || left.name.localeCompare(right.name),
    );
}

/**
 * Formats list rows as an aligned `Name | Type | Owner | Opened | Baseline | Status | Intake mode |
 * Schema-routes | Intake hash | Drop placed` table.
 */
export function formatIterationTable(listings: readonly IterationListing[]): string {
  const header = [
    'Name',
    'Type',
    'Owner',
    'Opened',
    'Baseline',
    'Status',
    'Intake mode',
    'Schema-routes',
    'Intake hash',
    'Drop placed',
  ];
  const rows = listings.map((listing) => [
    listing.name,
    listing.type,
    listing.owner,
    listing.opened,
    listing.baseline,
    listing.status,
    listing.intakeMode,
    listing.schemaRoutes,
    listing.intakeHash,
    listing.dropPlaced,
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join(' | ')} |`;
  const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;
  return [line(header), separator, ...rows.map(line)].join('\n');
}

// ── iteration:status ────────────────────────────────────────────────────────

/** Returns whether `value` is one of {@link ITERATION_STATUSES}. */
export function isIterationStatus(value: string): value is IterationStatus {
  return (ITERATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Parses `pnpm iteration:status <iteration> <status> [--reason "<text>"]`.
 *
 * @remarks
 * Failure modes: throws on an unknown option, a `--reason` without text, or a third positional.
 */
export function parseStatusArguments(commandLine: readonly string[]): {
  readonly iteration: string | undefined;
  readonly status: string | undefined;
  readonly reason: string | undefined;
  readonly help: boolean;
} {
  const positionals: string[] = [];
  let reason: string | undefined;
  let help = false;
  for (let index = 0; index < commandLine.length; index += 1) {
    const token = commandLine[index] ?? '';
    if (token === '--help' || token === '-h') help = true;
    else if (token === '--reason') {
      reason = commandLine[index + 1]?.trim();
      if (reason === undefined || reason === '' || reason.startsWith('--')) {
        throw new Error('--reason needs text, e.g. --reason "scope changed after review"');
      }
      index += 1;
    } else if (token.startsWith('--reason=')) {
      reason = token.slice('--reason='.length).trim();
      if (reason === '') throw new Error('--reason needs text.');
    } else if (token.startsWith('-')) throw new Error(`Unknown option "${token}".`);
    else positionals.push(token);
  }
  if (positionals.length > 2) {
    throw new Error(
      `Too many arguments: ${positionals.join(' ')} — expected <iteration> <status>.`,
    );
  }
  return { iteration: positionals[0], status: positionals[1], reason, help };
}

/**
 * Checks one Status move against the lifecycle.
 *
 * @remarks
 * Allowed: one step forward along `planning → ready-for-approval → approved → implementing →
 * done → frozen`, and `ready-for-approval`, `approved`, `implementing` or `done` back to `planning`
 * with a reason.
 *
 * Failure modes: throws with the allowed next statuses on any other move, and when a move back to
 * `planning` has no reason.
 */
export function validateStatusTransition(move: {
  readonly from: IterationStatus;
  readonly to: IterationStatus;
  readonly reason: string | undefined;
}): void {
  const { from, to, reason } = move;
  if (FORWARD_TRANSITIONS.get(from) === to) return;
  if (to === 'planning' && BACK_TO_PLANNING.has(from)) {
    if (reason === undefined) {
      throw new Error(`Moving ${from} → planning needs --reason "<why it goes back>".`);
    }
    return;
  }
  const allowed = [
    ...(FORWARD_TRANSITIONS.has(from) ? [FORWARD_TRANSITIONS.get(from)] : []),
    ...(BACK_TO_PLANNING.has(from) ? ['planning (with --reason)'] : []),
  ];
  throw new Error(
    `Cannot move ${from} → ${to}. From ${from} the allowed next status is ${
      allowed.length === 0 ? 'none — a frozen iteration is never edited' : allowed.join(' or ')
    }.`,
  );
}

/**
 * Decides a `pnpm iteration:status` change without writing it.
 *
 * @remarks
 * Algorithm: reads the README, validates the move ({@link validateStatusTransition}), sets the
 * Status row and appends a History line signed with `git config user.name`.
 *
 * Failure modes: throws on an unknown iteration or status, an unknown current Status, a refused
 * move, or an empty `user.name`.
 *
 * Side effects: runs `git config user.name`; writes nothing.
 */
export function planStatusChange(request: {
  readonly repositoryRoot: string;
  readonly iteration: string | undefined;
  readonly status: string | undefined;
  readonly reason: string | undefined;
  readonly today?: string;
}): ReadmeChangePlan {
  const { repositoryRoot, iteration, status, reason } = request;
  if (iteration === undefined || status === undefined) {
    throw new Error('Usage: pnpm iteration:status <iteration> <status> [--reason "<text>"]');
  }
  const readme = readIterationReadme({ repositoryRoot, iteration });
  if (!isIterationStatus(status)) {
    throw new Error(`Unknown status "${status}" — use ${ITERATION_STATUSES.join(', ')}.`);
  }
  const current = readme.fields.get('Status') ?? '';
  if (!isIterationStatus(current)) {
    throw new Error(`${iteration}/README.md has Status "${current}", which is not a known status.`);
  }
  validateStatusTransition({ from: current, to: status, reason });
  const historyEntry = renderHistoryEntry({
    date: request.today ?? localDate(new Date()),
    change: `${current} → ${status}`,
    reason,
    owner: gitUserName(repositoryRoot),
  });
  return {
    readmePath: readme.path,
    from: current,
    to: status,
    historyEntry,
    content: appendHistoryEntry({
      readme: setReadmeField({ readme: readme.content, label: 'Status', value: status }),
      historyEntry,
    }),
  };
}

// ── iteration:baseline ──────────────────────────────────────────────────────

/**
 * Decides a `pnpm iteration:baseline <iteration> <baseline|none>` change without writing it.
 *
 * @remarks
 * Algorithm: the Baseline must be `none` or an existing iteration in this repository's working
 * tree, other than the iteration itself, opened no later than it, whose `intake-files/` holds the
 * required set (the incremental delta is a diff of `intake-files/`). Sets the Baseline row and
 * appends a History line `Baseline <from> → <to>`.
 *
 * Failure modes: throws on an unknown iteration, a Baseline that is not an earlier iteration, an
 * unchanged Baseline, or an empty `user.name`.
 *
 * Side effects: runs `git config user.name`; writes nothing.
 */
export function planBaselineChange(request: {
  readonly repositoryRoot: string;
  readonly iteration: string | undefined;
  readonly baseline: string | undefined;
  readonly today?: string;
}): ReadmeChangePlan {
  const { repositoryRoot, iteration, baseline } = request;
  if (iteration === undefined || baseline === undefined) {
    throw new Error('Usage: pnpm iteration:baseline <iteration> <baseline|none>');
  }
  const readme = readIterationReadme({ repositoryRoot, iteration });
  if (baseline !== NO_BASELINE) {
    const opened = readme.fields.get('Opened') ?? parseIterationName(iteration)?.opened ?? '';
    const candidate = readAllIterationFields(repositoryRoot).get(baseline);
    const candidateOpened = candidate?.get('Opened') ?? parseIterationName(baseline)?.opened ?? '';
    if (baseline === iteration || candidate === undefined || candidateOpened > opened) {
      throw new Error(
        `Baseline "${baseline}" must be "none" or an earlier iteration in this repository — see pnpm iteration:list.`,
      );
    }
    const missing = missingIntakeFiles({ repositoryRoot, iteration: baseline });
    if (missing.length > 0) {
      throw new Error(
        `Baseline "${baseline}" has no complete ${INTAKE_DIRECTORY}/ (missing ${missing.join(', ')}) — an incremental iteration diffs ${INTAKE_DIRECTORY}/ against its Baseline's, so it must be there.`,
      );
    }
  }
  const current = readme.fields.get('Baseline') ?? EMPTY_FIELD;
  if (current === baseline) throw new Error(`${iteration} already has Baseline ${baseline}.`);
  const historyEntry = renderHistoryEntry({
    date: request.today ?? localDate(new Date()),
    change: `Baseline ${current} → ${baseline}`,
    reason: undefined,
    owner: gitUserName(repositoryRoot),
  });
  return {
    readmePath: readme.path,
    from: current,
    to: baseline,
    historyEntry,
    content: appendHistoryEntry({
      readme: setReadmeField({ readme: readme.content, label: 'Baseline', value: baseline }),
      historyEntry,
    }),
  };
}
