/**
 * Design-iteration model behind `pnpm iteration:new` and `pnpm iteration:list`.
 *
 * An iteration is a folder `iterations/<type>-<topic>-<YYYY-MM-DD>-<id>/` holding one
 * product/design change; the rules live in `iterations/README.md`. clinozy-fe ships the same
 * commands, names and README format, so a folder created in either repository with `--both`
 * looks the same in both.
 */
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gitEnvironmentWithoutInheritedRepository } from '@tooling/setup/common/git-environment.js';

/** The four iteration types, in the order the docs list them. */
export const ITERATION_TYPES = ['launch', 'feat', 'change', 'fix'] as const;

/** One of {@link ITERATION_TYPES}. */
export type IterationType = (typeof ITERATION_TYPES)[number];

/** Folder (relative to a repository root) that holds every iteration. */
export const ITERATIONS_DIRECTORY = 'iterations';

/**
 * Status a freshly opened iteration starts in (`planning` → `ready-for-approval` → `approved` →
 * `implementing` → `done` → `frozen`; see iterations/README.md).
 */
export const INITIAL_ITERATION_STATUS = 'planning';

/** Baseline recorded for the launch, the only iteration that builds on nothing. */
export const NO_BASELINE = 'none';

/** Placeholder for an empty README field (the launch's Topic, a new iteration's Summary). */
export const EMPTY_FIELD = '—';

/** Maximum random suffixes tried before giving up on a unique name. */
export const MAXIMUM_NAME_ATTEMPTS = 20;

/** Templates written into this repository's iteration folder (relative to `templates/`). */
export const LOCAL_ITERATION_TEMPLATES = [
  'README.md',
  'PRD.md',
  'schema-routes.md',
  'plans/product-plan.md',
] as const;

/** Templates written into the sibling (clinozy-fe) folder when `--both` is passed. */
export const SIBLING_ITERATION_TEMPLATES = ['README.md', 'PRD.md', 'schema-routes.md'] as const;

const TEMPLATES_DIRECTORY = join(import.meta.dirname, 'templates');
const TOPIC_PATTERN = /^[a-z]+(?:-[a-z]+)*$/;
const ITERATION_NAME_PATTERN =
  /^(launch|feat|change|fix)(?:-([a-z]+(?:-[a-z]+)*))?-(\d{4}-\d{2}-\d{2})-([a-z]{4})$/;
const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const SUFFIX_LENGTH = 4;
const TEMPLATE_PLACEHOLDER = /\{\{(\w+)\}\}/g;
const README_ROW = /^\|\s*([A-Za-z]+)\s*\|\s*(.*?)\s*\|\s*$/;
const LOCAL_PACKAGE_SUFFIX = '-be';
const SIBLING_PACKAGE_SUFFIX = '-fe';

/** The fields of an iteration's `README.md`, in table order. */
export interface IterationReadmeFields {
  readonly type: string;
  readonly topic: string;
  readonly owner: string;
  readonly opened: string;
  readonly branch: string;
  readonly baseline: string;
  readonly status: string;
  readonly summary: string;
}

/** One row of `pnpm iteration:list`. */
export interface IterationListing {
  readonly name: string;
  readonly type: string;
  readonly owner: string;
  readonly opened: string;
  readonly baseline: string;
  readonly status: string;
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

/** A file the generator will write, with its absolute path. */
export interface PlannedFile {
  readonly path: string;
  readonly content: string;
}

/** Everything `pnpm iteration:new` decided, before anything touches the disk. */
export interface NewIterationPlan {
  readonly name: string;
  readonly fields: IterationReadmeFields;
  /** False when the Baseline fell back to the current branch because the base branch holds none. */
  readonly baselineOnBaseBranch: boolean;
  readonly localFolder: string;
  readonly siblingFolder: string | undefined;
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

interface BaselineCandidate {
  readonly name: string;
  readonly opened: string;
  readonly lastCommitTime: number;
}

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

/** Formats a date as local `YYYY-MM-DD` — the day as the person opening the iteration sees it. */
export function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

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
 * Only `| Label | Value |` rows count; the header row and separator are skipped, as is any
 * row whose first cell is not a single word.
 */
export function parseIterationReadme(markdown: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const line of markdown.split('\n')) {
    const match = README_ROW.exec(line.trim());
    if (!match) continue;
    const [, label, value] = match;
    if (label === undefined || value === undefined || label === 'Field') continue;
    fields.set(label, value);
  }
  return fields;
}

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

function openedDate(candidate: {
  readonly name: string;
  readonly readme: string | undefined;
}): string {
  const fromReadme =
    candidate.readme === undefined
      ? undefined
      : parseIterationReadme(candidate.readme).get('Opened');
  return fromReadme ?? parseIterationName(candidate.name)?.opened ?? '';
}

function lastCommitTime(location: {
  readonly repositoryRoot: string;
  readonly revision: string;
  readonly name: string;
}): number {
  const timestamp = tryGit({
    repositoryRoot: location.repositoryRoot,
    gitArguments: [
      'log',
      '-1',
      '--format=%ct',
      location.revision,
      '--',
      `${ITERATIONS_DIRECTORY}/${location.name}`,
    ],
  });
  return timestamp ? Number(timestamp) : 0;
}

/**
 * Picks the Baseline among candidate iterations: the latest Opened date, then the newest last
 * commit (merge order), then the name — so the choice is deterministic.
 */
export function chooseBaseline(candidates: readonly BaselineCandidate[]): string | undefined {
  const ranked = [...candidates].sort(
    (left, right) =>
      right.opened.localeCompare(left.opened) ||
      right.lastCommitTime - left.lastCommitTime ||
      right.name.localeCompare(left.name),
  );
  return ranked[0]?.name;
}

/**
 * Resolves the Baseline for a new non-launch iteration.
 *
 * @remarks
 * Algorithm: the iterations committed on the base branch are ranked by {@link chooseBaseline},
 * reading Opened from each README as committed there. When the base branch holds none yet, the
 * iterations in the working tree are ranked the same way and `onBaseBranch` is false, so the
 * caller can say the Baseline is not on the base branch yet.
 *
 * Failure modes: returns `undefined` when no iteration exists anywhere.
 */
export function resolveBaseline(location: {
  readonly repositoryRoot: string;
  readonly baseBranch: string;
}): { readonly baseline: string; readonly onBaseBranch: boolean } | undefined {
  const { repositoryRoot, baseBranch } = location;
  const onBase = baseBranchIterationNames(location).map((name) => ({
    name,
    opened: openedDate({
      name,
      readme: tryGit({
        repositoryRoot,
        gitArguments: ['show', `${baseBranch}:${ITERATIONS_DIRECTORY}/${name}/README.md`],
      }),
    }),
    lastCommitTime: lastCommitTime({ repositoryRoot, revision: baseBranch, name }),
  }));
  const fromBase = chooseBaseline(onBase);
  if (fromBase !== undefined) return { baseline: fromBase, onBaseBranch: true };

  const inWorkingTree = workingTreeIterationNames(repositoryRoot).map((name) => {
    const readmePath = join(repositoryRoot, ITERATIONS_DIRECTORY, name, 'README.md');
    return {
      name,
      opened: openedDate({
        name,
        readme: existsSync(readmePath) ? readFileSync(readmePath, 'utf-8') : undefined,
      }),
      lastCommitTime: lastCommitTime({ repositoryRoot, revision: 'HEAD', name }),
    };
  });
  const fromWorkingTree = chooseBaseline(inWorkingTree);
  return fromWorkingTree === undefined
    ? undefined
    : { baseline: fromWorkingTree, onBaseBranch: false };
}

/** Maps a `-be` package name to its `-fe` sibling (`acme-be` → `acme-fe`). */
export function siblingPackageName(packageName: string): string {
  if (!packageName.endsWith(LOCAL_PACKAGE_SUFFIX)) {
    throw new Error(
      `package.json name "${packageName}" does not end in ${LOCAL_PACKAGE_SUFFIX} — pass --sibling <path>.`,
    );
  }
  return `${packageName.slice(0, -LOCAL_PACKAGE_SUFFIX.length)}${SIBLING_PACKAGE_SUFFIX}`;
}

/**
 * Resolves and checks the sibling repository for `--both`.
 *
 * @remarks
 * Algorithm: `--sibling <path>` wins (resolved against the repository root); otherwise the sibling
 * is `../<name>` with this repository's `package.json` name mapped `-be` → `-fe`.
 *
 * Failure modes: throws when the folder has no `package.json`, so a typo never creates a stray
 * `iterations/` folder somewhere else on disk.
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

/**
 * Decides everything `pnpm iteration:new` will do, without writing anything.
 *
 * @remarks
 * Algorithm: validate type + topic; collect existing iterations (this working tree, the base
 * branch, and the sibling's working tree under `--both`); refuse a second launch and refuse any
 * non-launch before a launch exists; pick a name with a fresh random suffix, retrying while it is
 * taken; resolve the Baseline; read Owner (`git config user.name`) and Branch (current branch);
 * render the templates for this repository and, under `--both`, the sibling.
 *
 * Failure modes: throws with a message meant for the terminal on any refusal, a missing
 * `user.name`, or a detached HEAD.
 *
 * Side effects: runs read-only git commands; writes nothing (see {@link writeIterationPlan}).
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

  const resolved = type === 'launch' ? undefined : resolveBaseline({ repositoryRoot, baseBranch });
  const owner = tryGit({ repositoryRoot, gitArguments: ['config', 'user.name'] }) ?? '';
  if (owner === '') throw new Error('git config user.name is not set — it fills the Owner field.');
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
    baseline: resolved?.baseline ?? NO_BASELINE,
    status: INITIAL_ITERATION_STATUS,
    summary: EMPTY_FIELD,
  };
  const values = { name, ...fields };
  const render = (templates: readonly string[], folder: string): PlannedFile[] =>
    templates.map((relativePath) => ({
      path: join(folder, relativePath),
      content: renderTemplate({ template: readIterationTemplate(relativePath), values }),
    }));

  const localFolder = join(repositoryRoot, ITERATIONS_DIRECTORY, name);
  const siblingFolder =
    siblingRoot === undefined ? undefined : join(siblingRoot, ITERATIONS_DIRECTORY, name);
  return {
    name,
    fields,
    baselineOnBaseBranch: resolved?.onBaseBranch ?? true,
    localFolder,
    siblingFolder,
    files: [
      ...render(LOCAL_ITERATION_TEMPLATES, localFolder),
      ...(siblingFolder === undefined ? [] : render(SIBLING_ITERATION_TEMPLATES, siblingFolder)),
    ],
  };
}

/**
 * Writes the files of a {@link NewIterationPlan}.
 *
 * @remarks
 * Failure modes: refuses to overwrite — throws if any planned file already exists, before writing
 * any of them.
 *
 * Side effects: creates the iteration folder(s) and their files.
 */
export function writeIterationPlan(plan: NewIterationPlan): void {
  const existing = plan.files.find((file) => existsSync(file.path));
  if (existing !== undefined) throw new Error(`${existing.path} already exists — not overwriting.`);
  for (const file of plan.files) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content);
  }
}

/** Reads every `iterations/*\/README.md` in a working tree into list rows, oldest first. */
export function readIterationListings(repositoryRoot: string): IterationListing[] {
  return workingTreeIterationNames(repositoryRoot)
    .map((name) => {
      const readmePath = join(repositoryRoot, ITERATIONS_DIRECTORY, name, 'README.md');
      const fields = existsSync(readmePath)
        ? parseIterationReadme(readFileSync(readmePath, 'utf-8'))
        : new Map<string, string>();
      const field = (label: string): string => fields.get(label) ?? EMPTY_FIELD;
      return {
        name,
        type: field('Type'),
        owner: field('Owner'),
        opened: field('Opened'),
        baseline: field('Baseline'),
        status: field('Status'),
      };
    })
    .sort(
      (left, right) =>
        left.opened.localeCompare(right.opened) || left.name.localeCompare(right.name),
    );
}

/** Formats list rows as an aligned `Name | Type | Owner | Opened | Baseline | Status` table. */
export function formatIterationTable(listings: readonly IterationListing[]): string {
  const header = ['Name', 'Type', 'Owner', 'Opened', 'Baseline', 'Status'];
  const rows = listings.map((listing) => [
    listing.name,
    listing.type,
    listing.owner,
    listing.opened,
    listing.baseline,
    listing.status,
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join(' | ')} |`;
  const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;
  return [line(header), separator, ...rows.map(line)].join('\n');
}
