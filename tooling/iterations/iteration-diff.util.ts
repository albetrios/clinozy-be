/**
 * `pnpm iteration:diff` — compare two iterations' `intake-files/` (Baseline ↔ current).
 *
 * Every iteration's intake holds the full drop, so the delta of an incremental iteration is this
 * comparison plus the designer's "What changed" notes; anything the comparison shows that the notes
 * omit is a finding. The summary covers files, screens (via `_index.md` Slugs where present),
 * whether the PRD, `schema-routes.md` or the prototype changed, and the `schema-routes.md` entities,
 * fields, enums, routes and operations added, removed or changed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gitEnvironmentWithoutInheritedRepository } from '@tooling/setup/common/git-environment.js';
import {
  EMPTY_FIELD,
  INTAKE_DIRECTORY,
  ITERATIONS_DIRECTORY,
  NO_BASELINE,
  readIterationReadme,
  suggestBaseline,
} from './iteration.util.js';

/** Added, removed and changed names — sorted. */
export interface ChangeSet {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
}

/** The parts of a `schema-routes.md` a diff compares, each keyed to a row signature. */
export interface SchemaRoutesModel {
  /** Entity → field → the rest of its row (type, required, constraints…). */
  readonly entities: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** Enum → machine value → the rest of its row. */
  readonly enums: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** Route path → the rest of its row. */
  readonly routes: ReadonlyMap<string, string>;
  /** `<screen> › <operation>` → the rest of its row. */
  readonly operations: ReadonlyMap<string, string>;
}

/** The structured result of `pnpm iteration:diff` (what `--json` prints). */
export interface IntakeDiffSummary {
  readonly baseline: string;
  readonly current: string;
  readonly files: ChangeSet;
  readonly screens: ChangeSet;
  readonly prdChanged: boolean;
  readonly schemaRoutesChanged: boolean;
  readonly prototypeChanged: boolean;
  readonly schemaRoutes: {
    readonly entities: ChangeSet;
    readonly fields: ChangeSet;
    readonly enums: ChangeSet;
    readonly routes: ChangeSet;
    readonly operations: ChangeSet;
  };
}

const ESCAPED_PIPE = '\u0000';
const PROTOTYPE_EXTENSIONS = ['.html', '.js'];

function tableCells(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!(trimmed.startsWith('|') && trimmed.endsWith('|'))) return undefined;
  const cells = trimmed
    .replaceAll('\\|', ESCAPED_PIPE)
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.replaceAll(ESCAPED_PIPE, '|').trim());
  if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return undefined;
  return cells;
}

/**
 * Parses the comparable parts of a `schema-routes.md`.
 *
 * @remarks
 * Algorithm: tracks the `# ` section and the `## ` heading. `## Entity: <name>` tables give fields
 * (first column) — a trailing `(…)` note on the name is dropped; `## Enum: <name>` tables give machine
 * values; `# Route map` rows whose first cell is a backticked path give routes; `# Operations`
 * tables under `## Screen: <name>` give operations. Header rows and `n/a` rows are skipped; each
 * row's other cells form its signature, so an edited row reads as changed.
 */
export function parseSchemaRoutes(markdown: string): SchemaRoutesModel {
  const entities = new Map<string, Map<string, string>>();
  const enums = new Map<string, Map<string, string>>();
  const routes = new Map<string, string>();
  const operations = new Map<string, string>();
  let section = '';
  let heading: { kind: 'entity' | 'enum' | 'screen' | 'other'; name: string } = {
    kind: 'other',
    name: '',
  };
  for (const line of markdown.split('\n')) {
    if (line.startsWith('# ')) {
      section = line.slice(2).trim().toLowerCase();
      heading = { kind: 'other', name: '' };
      continue;
    }
    if (line.startsWith('## ')) {
      const title = line.slice(3).trim();
      const named = (prefix: string): string =>
        title
          .slice(prefix.length)
          .replace(/\s*\(.*\)\s*$/, '')
          .trim();
      if (title.startsWith('Entity:')) {
        heading = { kind: 'entity', name: named('Entity:') };
        entities.set(heading.name, entities.get(heading.name) ?? new Map());
      } else if (title.startsWith('Enum:')) {
        heading = { kind: 'enum', name: named('Enum:') };
        enums.set(heading.name, enums.get(heading.name) ?? new Map());
      } else if (title.startsWith('Screen:')) heading = { kind: 'screen', name: named('Screen:') };
      else heading = { kind: 'other', name: title };
      continue;
    }
    const cells = tableCells(line);
    if (cells === undefined || cells.length < 2) continue;
    const [first = '', ...rest] = cells;
    const signature = rest.join(' | ');
    if (section === 'route map') {
      const path = /^`([^`]+)`$/.exec(first)?.[1];
      if (path !== undefined) routes.set(path, signature);
    } else if (heading.kind === 'entity') {
      if (first !== 'Field') entities.get(heading.name)?.set(first, signature);
    } else if (heading.kind === 'enum') {
      if (first !== 'Machine value') enums.get(heading.name)?.set(first, signature);
    } else if (
      heading.kind === 'screen' &&
      section === 'operations' &&
      first !== 'Operation' &&
      first !== 'n/a'
    ) {
      operations.set(`${heading.name} › ${first}`, signature);
    }
  }
  return { entities, enums, routes, operations };
}

function compareMaps<Value>(sides: {
  readonly before: ReadonlyMap<string, Value>;
  readonly after: ReadonlyMap<string, Value>;
  readonly same: (left: Value, right: Value) => boolean;
}): ChangeSet {
  const { before, after, same } = sides;
  const added = [...after.keys()].filter((key) => !before.has(key));
  const removed = [...before.keys()].filter((key) => !after.has(key));
  const changed = [...after.keys()].filter((key) => {
    const left = before.get(key);
    const right = after.get(key);
    return left !== undefined && right !== undefined && !same(left, right);
  });
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

function sameMap(left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (right.get(key) !== value) return false;
  return true;
}

/** Compares two parsed `schema-routes.md` files. */
export function compareSchemaRoutes(models: {
  readonly before: SchemaRoutesModel;
  readonly after: SchemaRoutesModel;
}): IntakeDiffSummary['schemaRoutes'] {
  const { before, after } = models;
  const entities = compareMaps({ before: before.entities, after: after.entities, same: sameMap });
  const fieldsAdded: string[] = [];
  const fieldsRemoved: string[] = [];
  const fieldsChanged: string[] = [];
  for (const entity of after.entities.keys()) {
    const beforeFields = before.entities.get(entity);
    const afterFields = after.entities.get(entity);
    if (beforeFields === undefined || afterFields === undefined) continue;
    const fields = compareMaps({
      before: beforeFields,
      after: afterFields,
      same: (a, b) => a === b,
    });
    fieldsAdded.push(...fields.added.map((field) => `${entity}.${field}`));
    fieldsRemoved.push(...fields.removed.map((field) => `${entity}.${field}`));
    fieldsChanged.push(...fields.changed.map((field) => `${entity}.${field}`));
  }
  return {
    entities,
    fields: {
      added: fieldsAdded.sort(),
      removed: fieldsRemoved.sort(),
      changed: fieldsChanged.sort(),
    },
    enums: compareMaps({ before: before.enums, after: after.enums, same: sameMap }),
    routes: compareMaps({ before: before.routes, after: after.routes, same: (a, b) => a === b }),
    operations: compareMaps({
      before: before.operations,
      after: after.operations,
      same: (a, b) => a === b,
    }),
  };
}

function intakeFolder(location: {
  readonly repositoryRoot: string;
  readonly iteration: string;
}): string {
  return join(location.repositoryRoot, ITERATIONS_DIRECTORY, location.iteration, INTAKE_DIRECTORY);
}

function readFiles(folder: string): ReadonlyMap<string, Buffer> {
  const files = new Map<string, Buffer>();
  if (!existsSync(folder)) return files;
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.startsWith('.')) {
      files.set(entry.name, readFileSync(join(folder, entry.name)));
    }
  }
  return files;
}

function screenSlugs(index: Buffer | undefined): string[] {
  if (index === undefined) return [];
  let slugColumn = -1;
  const slugs: string[] = [];
  for (const line of index.toString('utf-8').split('\n')) {
    const cells = tableCells(line);
    if (cells === undefined) continue;
    const headerIndex = cells.findIndex((cell) => cell.toLowerCase() === 'slug');
    if (headerIndex !== -1) {
      slugColumn = headerIndex;
      continue;
    }
    const slug = slugColumn === -1 ? undefined : cells[slugColumn]?.replaceAll('`', '').trim();
    if (slug) slugs.push(slug);
  }
  return slugs;
}

/**
 * Summarizes the difference between two iterations' intake files.
 *
 * @remarks
 * Algorithm: compares the flat file sets byte by byte; maps changed `<slug>.md` files to screens
 * through either side's `_index.md` Slug column; flags `PRD.md`, `schema-routes.md` and prototype
 * (`.html`, `.js`) changes; parses both `schema-routes.md` files ({@link parseSchemaRoutes}) and
 * compares them ({@link compareSchemaRoutes}).
 *
 * Failure modes: throws when either iteration has no README or no `intake-files/` — the
 * comparison covers `intake-files/` only, so both sides are mandatory.
 */
export function summarizeIntakeDiff(request: {
  readonly repositoryRoot: string;
  readonly baseline: string;
  readonly current: string;
}): IntakeDiffSummary {
  const { repositoryRoot, baseline, current } = request;
  readIterationReadme({ repositoryRoot, iteration: baseline });
  readIterationReadme({ repositoryRoot, iteration: current });
  const beforeFolder = intakeFolder({ repositoryRoot, iteration: baseline });
  const afterFolder = intakeFolder({ repositoryRoot, iteration: current });
  for (const [iteration, folder] of [
    [baseline, beforeFolder],
    [current, afterFolder],
  ] as const) {
    if (!existsSync(folder)) {
      throw new Error(
        `${iteration} has no ${INTAKE_DIRECTORY}/ — the incremental delta is a diff of ${INTAKE_DIRECTORY}/ only, so both iterations need theirs: pnpm iteration:intake ${iteration} <source-folder>.`,
      );
    }
  }
  const before = readFiles(beforeFolder);
  const after = readFiles(afterFolder);
  const files = compareMaps({ before, after, same: (left, right) => left.equals(right) });
  const touched = new Set([...files.added, ...files.removed, ...files.changed]);
  const slugs = new Set([
    ...screenSlugs(before.get('_index.md')),
    ...screenSlugs(after.get('_index.md')),
  ]);
  const asScreens = (names: readonly string[]): string[] =>
    names
      .filter((name) => name.endsWith('.md') && slugs.has(name.slice(0, -'.md'.length)))
      .map((name) => name.slice(0, -'.md'.length));
  const schemaBefore = before.get('schema-routes.md')?.toString('utf-8') ?? '';
  const schemaAfter = after.get('schema-routes.md')?.toString('utf-8') ?? '';
  return {
    baseline,
    current,
    files,
    screens: {
      added: asScreens(files.added),
      removed: asScreens(files.removed),
      changed: asScreens(files.changed),
    },
    prdChanged: touched.has('PRD.md'),
    schemaRoutesChanged: touched.has('schema-routes.md'),
    prototypeChanged: [...touched].some((name) =>
      PROTOTYPE_EXTENSIONS.some((extension) => name.endsWith(extension)),
    ),
    schemaRoutes: compareSchemaRoutes({
      before: parseSchemaRoutes(schemaBefore),
      after: parseSchemaRoutes(schemaAfter),
    }),
  };
}

function changeLines(title: string, changes: ChangeSet): string[] {
  const parts: string[] = [];
  if (changes.added.length > 0)
    parts.push(`  + added   (${changes.added.length}): ${changes.added.join(', ')}`);
  if (changes.removed.length > 0)
    parts.push(`  − removed (${changes.removed.length}): ${changes.removed.join(', ')}`);
  if (changes.changed.length > 0)
    parts.push(`  ~ changed (${changes.changed.length}): ${changes.changed.join(', ')}`);
  return [`${title}:`, ...(parts.length > 0 ? parts : ['  (no change)'])];
}

/** Formats an {@link IntakeDiffSummary} for the terminal. */
export function formatIntakeDiffSummary(summary: IntakeDiffSummary): string {
  const yesNo = (value: boolean): string => (value ? 'changed' : 'unchanged');
  return [
    `iteration:diff ${summary.baseline} → ${summary.current} (${INTAKE_DIRECTORY}/)`,
    '',
    ...changeLines('Files', summary.files),
    ...changeLines('Screens (via _index.md)', summary.screens),
    `PRD.md: ${yesNo(summary.prdChanged)} · schema-routes.md: ${yesNo(summary.schemaRoutesChanged)} · prototype: ${yesNo(summary.prototypeChanged)}`,
    '',
    'schema-routes.md',
    ...changeLines('Entities', summary.schemaRoutes.entities),
    ...changeLines('Fields', summary.schemaRoutes.fields),
    ...changeLines('Enums', summary.schemaRoutes.enums),
    ...changeLines('Routes', summary.schemaRoutes.routes),
    ...changeLines('Operations', summary.schemaRoutes.operations),
  ].join('\n');
}

/** Runs `git diff --no-index` between the two iterations' `intake-files/` and returns its output. */
export function rawIntakeDiff(request: {
  readonly repositoryRoot: string;
  readonly baseline: string;
  readonly current: string;
}): string {
  const result = spawnSync(
    'git',
    [
      'diff',
      '--no-index',
      '--',
      join(ITERATIONS_DIRECTORY, request.baseline, INTAKE_DIRECTORY),
      join(ITERATIONS_DIRECTORY, request.current, INTAKE_DIRECTORY),
    ],
    {
      cwd: request.repositoryRoot,
      encoding: 'utf-8',
      env: gitEnvironmentWithoutInheritedRepository(),
    },
  );
  return result.stdout ?? '';
}

/** Parsed `pnpm iteration:diff [<baseline>] <current> [--json]` command line. */
export function parseDiffArguments(commandLine: readonly string[]): {
  readonly baseline: string | undefined;
  readonly current: string | undefined;
  readonly json: boolean;
  readonly help: boolean;
} {
  const positionals: string[] = [];
  let json = false;
  let help = false;
  for (const token of commandLine) {
    if (token === '--json') json = true;
    else if (token === '--help' || token === '-h') help = true;
    else if (token.startsWith('-')) throw new Error(`Unknown option "${token}".`);
    else positionals.push(token);
  }
  if (positionals.length > 2) {
    throw new Error(
      `Too many arguments: ${positionals.join(' ')} — expected [<baseline>] <current>.`,
    );
  }
  return positionals.length === 2
    ? { baseline: positionals[0], current: positionals[1], json, help }
    : { baseline: undefined, current: positionals[0], json, help };
}

/**
 * Explains what to compare against when no Baseline is given — the recorded Baseline and the
 * suggestion — so the caller can ask the user. Returns the message.
 */
export function missingBaselineMessage(request: {
  readonly repositoryRoot: string;
  readonly current: string;
}): string {
  const readme = readIterationReadme({
    repositoryRoot: request.repositoryRoot,
    iteration: request.current,
  });
  const recorded = readme.fields.get('Baseline');
  const suggested = suggestBaseline({
    repositoryRoot: request.repositoryRoot,
    excluding: request.current,
  });
  const lines = ['No Baseline given.'];
  if (recorded !== undefined && recorded !== NO_BASELINE && recorded !== EMPTY_FIELD) {
    lines.push(`  Recorded in ${request.current}/README.md: ${recorded}`);
  }
  lines.push(
    suggested === undefined
      ? '  Suggested: none — no iteration in this repository is done or frozen yet.'
      : `  Suggested (latest done/frozen in this repository): ${suggested}`,
  );
  const pick =
    recorded !== undefined && recorded !== NO_BASELINE && recorded !== EMPTY_FIELD
      ? recorded
      : suggested;
  if (pick !== undefined)
    lines.push(`Confirm and re-run: pnpm iteration:diff ${pick} ${request.current}`);
  return lines.join('\n');
}
