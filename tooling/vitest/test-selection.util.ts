/**
 * Test selection behind `pnpm test:select` — which Vitest files a set of changed files can affect.
 *
 * Four ways a test is selected, each recorded in `why`:
 *
 * - **Next to the code** — every test under the folder that owns the changed file's tests (the
 *   nearest folder above it with a `__tests__/` child: the sub-domain, or the domain root), as
 *   the canonical layout keeps them. This catches a test that loads its code by name through a
 *   shared helper (`describeAppRecordServiceContract('leadsService')`).
 * - **Imports** — a test whose import graph (static and dynamic `import`, `export … from`,
 *   `vi.mock`, `require`) reaches a changed file. Exact for the tests that load the code they
 *   test, which is every unit-level test.
 * - **Domain map** — a test that boots the whole app (it reaches `src/app.ts`) imports every
 *   domain, so imports say nothing about it. It is selected by where it lives instead: the
 *   changed file's area (`app/<sub-domain>` for the app domain, `<domain>` otherwise), plus the
 *   areas whose code imports the changed file. The walk stops at a wiring file — outside every
 *   app sub-domain, importing three or more areas (`app.container.ts`, `app-record-tables.ts`) —
 *   which would otherwise connect every area to every other. App tests that name a reached
 *   sub-domain are selected too (`/app/leads` in a flow test). The import walk stops at the same
 *   wiring files and at the test harness (`src/tests/helpers/`, which imports every schema): a
 *   test that reaches a change only through them tests the wiring, not the changed code.
 * - **Mentions** — a test that names the changed path, its file name, a folder above it or a
 *   glob that matches it, also as `join('agent-os', 'hooks')` segments: the policy tests that
 *   read files instead of importing them.
 *
 * Any changed source under `src/` also runs the always-run set: the security project (RLS,
 * permission matrix), the cross-domain flows under `src/tests/e2e/`, the global policy scans,
 * every test that imports nothing from the repository (a scanner) and every test no single
 * source change would select ({@link findUnreachableTests}). The escalation list
 * runs everything: dependencies, Vitest config, the test harness, the auth and audit domains,
 * shared, core, infrastructure and migrations — a change there reaches nearly every test by
 * design. Tenancy and user are judged by the import graph like any other domain: measured on
 * 21 Oct 2026, a tenancy service change reaches 232 of the 747 unit files, a user one 122. A unit-level selection (`unitLevel`, pre-push's unit project) narrows
 * a migration to the tests that read migrations ({@link UNIT_LEVEL_NARROWED_GLOBS}): only a database
 * test sees a migration through the schema. It fails closed: a path outside the known roots, a deleted
 * file it cannot place, or any error selects everything.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, matchesGlob, posix } from 'node:path';
import { vitestProjects } from '@tooling/vitest/projects.js';

/** `all` runs every test, `selected` the files in `projects`, `none` no test at all. */
export type SelectionMode = 'all' | 'selected' | 'none';

/** What a change selects: the mode, why, and the test files by Vitest project. */
export interface TestSelection {
  mode: SelectionMode;
  /** Why the mode was chosen (the escalating path, the error, or a summary of the selection). */
  reasons: string[];
  /** Selected test files by Vitest project name; empty unless `mode` is `selected`. */
  projects: Record<string, string[]>;
  /** Each selected test file → why it was selected (a changed file and the rule, or always-run). */
  why: Record<string, string[]>;
}

/** Paths that run everything — a change there reaches nearly every test. */
export const ESCALATION_GLOBS = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'patches/**',
  'tsconfig*.json',
  'vitest.config.ts',
  'tooling/vitest/**',
  'src/tests/setup.ts',
  'src/tests/global-setup.ts',
  'src/tests/database-suite-lock.ts',
  'src/tests/helpers/**',
  'src/tests/factories/**',
  'src/tests/fixtures/**',
  'src/domains/auth/**',
  'src/domains/audit/**',
  'src/shared/**',
  'src/core/**',
  'src/infrastructure/**',
  'migrations/**',
  'src/*.ts',
  'src/domains/*.ts',
];

/**
 * Escalating paths a unit-level selection (`unitLevel`) narrows instead: a migration reaches every
 * database test through the schema, so a full selection still runs everything for it, but a
 * unit-level test sees a migration only by reading the `migrations` folder — every test whose
 * source names it ({@link READS_MIGRATIONS}) is selected.
 */
export const UNIT_LEVEL_NARROWED_GLOBS = ['migrations/**'];

/** A test that reads the migrations: its source names the `migrations` folder. */
export const READS_MIGRATIONS = /\bmigrations\b/;

/** Paths no test imports: they select only the tests that mention them. */
export const MENTION_ONLY_GLOBS = [
  '**/*.md',
  'docs/**',
  'agent-os/**',
  'iterations/**',
  '.github/**',
  '.husky/**',
  '.claude/**',
  '.cursor/**',
  '.codex/**',
  '.mcp.*.json',
  '.env.example',
  '.gitleaks.toml',
  '.semgrepignore',
  '.biomeignore',
  '.dockerignore',
  '.markdownlint*',
  'biome.json',
  'knip.jsonc',
  'sonar-project.properties',
  'commitlint.config.cjs',
  'lint-staged.config.mjs',
  'docker-compose*.yml',
  'docker-bake.hcl',
  'Dockerfile*',
];

/**
 * Policy tests that read every test file's source rather than import it — no test starts git
 * outside the throwaway-repository fixture. Nothing imports a test, so a changed test selects
 * them; otherwise a new test's own `git init` runs inside pre-push before CI judges it.
 */
export const TEST_SOURCE_POLICIES = ['src/tests/unit/ci/git-hook-environment.policy.unit.test.ts'];

/**
 * Policy tests that read every source file under `src/` and `tooling/` rather than import it — one
 * `docs/routes.txt` parser. Nothing imports a new file, so a changed code file selects them;
 * otherwise a second parser added in a new tooling file reaches the PR (planted-bug drill A8-4S,
 * 20 Oct 2026).
 */
export const SOURCE_SCAN_POLICIES = ['src/tests/unit/tooling/route-catalog-reader.unit.test.ts'];

/** Test files that run on any source change under `src/` (see the module comment). */
export const ALWAYS_RUN_GLOBS = [
  'src/tests/security/**/*.test.ts',
  'src/tests/e2e/**/*.test.ts',
  'src/tests/global/**/*.test.ts',
];

/** A wiring file imports this many other areas or more; the domain-map walk stops there. */
export const AGGREGATOR_AREA_COUNT = 3;

/** The test harness: it imports every schema to set up and clean the database, so a test that
 * reaches a changed file only through it is not selected by imports. */
export const HARNESS_GLOBS = [
  'src/tests/setup.ts',
  'src/tests/global-setup.ts',
  'src/tests/database-suite-lock.ts',
  'src/tests/helpers/**',
  'src/tests/factories/**',
];

const APP_ENTRY = 'src/app.ts';
const CODE_EXTENSIONS = ['.ts', '.mts', '.mjs', '.js', '.cjs'];
const GRAPH_ROOTS = ['src', 'tooling'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git']);
const TEST_FILE = /\.test\.(?:ts|mts|mjs)$/;
const IMPORT_PATTERNS = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bvi\.(?:mock|doMock|unmock|importActual|importMock)\(\s*['"]([^'"]+)['"]/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
];
/** A run of string literals separated by commas — `'agent-os', 'hooks'` reads as `agent-os/hooks`. */
const LITERAL_RUN = /(['"`])([^'"`\n$]+)\1(?:\s*,\s*(['"`])[^'"`\n$]+\3)*/g;
const LITERAL = /(['"`])([^'"`\n$]+)\1/g;

/** The repository's code files and test files, with their imports resolved to repository paths. */
export interface ImportGraph {
  /** Every code file under `src/` and `tooling/`, repository-relative with `/` separators. */
  files: string[];
  /** Test files (`*.test.ts`) among `files`. */
  tests: string[];
  /** File → the repository files it imports. */
  imports: Map<string, Set<string>>;
  /** File → the repository files that import it. */
  importers: Map<string, Set<string>>;
  /** Computed once per graph and reused by every selection on it (see {@link analyzeGraph}). */
  analysis?: GraphAnalysis;
}

/** What every selection on a graph shares: booting tests, wiring files, unreachable tests, texts. */
export interface GraphAnalysis {
  /** Files that reach `src/app.ts` through imports — their tests boot the whole app. */
  booting: Set<string>;
  /** Wiring files ({@link findAggregators}). */
  aggregators: Set<string>;
  /** Tests no single source change selects ({@link findUnreachableTests}) — always run. */
  unreachable: Set<string>;
  /** Container → the tests that load it, directly or through the harness ({@link findContainerBuildingTests}). */
  containerTests: Map<string, Set<string>>;
  /** Test file → its text and the paths it names, read once. */
  texts: Map<string, { source: string; named: string[] }>;
}

function toPosix(path: string): string {
  return path.split('\\').join('/');
}

function listCodeFiles(options: { repositoryRoot: string; directory: string }): string[] {
  const absolute = join(options.repositoryRoot, options.directory);
  if (!existsSync(absolute)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const path = posix.join(options.directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCodeFiles({ repositoryRoot: options.repositoryRoot, directory: path }));
    } else if (CODE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      files.push(path);
    }
  }
  return files;
}

/** The repository path a specifier names, or null when it is a package or cannot be placed. */
export function resolveSpecifier(options: {
  repositoryRoot: string;
  importer: string;
  specifier: string;
}): string | null {
  const { specifier } = options;
  let target: string;
  if (specifier.startsWith('@/')) target = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith('@tooling/')) target = `tooling/${specifier.slice(9)}`;
  else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    target = posix.normalize(posix.join(posix.dirname(options.importer), specifier));
  } else return null;
  const candidates = [target];
  if (target.endsWith('.js')) candidates.unshift(`${target.slice(0, -3)}.ts`);
  else if (target.endsWith('.mjs')) candidates.push(`${target.slice(0, -4)}.mts`);
  else if (!/\.[a-z]+$/.test(posix.basename(target))) {
    candidates.push(`${target}.ts`, `${target}/index.ts`, `${target}.js`, `${target}.mjs`);
  }
  const found = candidates.find((candidate) => {
    const absolute = join(options.repositoryRoot, candidate);
    return existsSync(absolute) && statSync(absolute).isFile();
  });
  // A deleted file keeps its node, so the files that still import it are found.
  return found ?? candidates[0] ?? null;
}

/** Build the import graph of `src/` and `tooling/`. */
export function buildImportGraph(repositoryRoot: string): ImportGraph {
  const files = GRAPH_ROOTS.flatMap((directory) => listCodeFiles({ repositoryRoot, directory }));
  const imports = new Map<string, Set<string>>();
  const importers = new Map<string, Set<string>>();
  for (const file of files) {
    const source = readFileSync(join(repositoryRoot, file), 'utf8');
    const targets = new Set<string>();
    for (const pattern of IMPORT_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (!specifier) continue;
        const target = resolveSpecifier({ repositoryRoot, importer: file, specifier });
        if (target && target !== file) targets.add(target);
      }
    }
    imports.set(file, targets);
    for (const target of targets) {
      const set = importers.get(target) ?? new Set<string>();
      set.add(file);
      importers.set(target, set);
    }
  }
  return { files, tests: files.filter(isTestFile), imports, importers };
}

/** True for a Vitest file (`*.test.ts`). */
export function isTestFile(path: string): boolean {
  return TEST_FILE.test(path);
}

/**
 * Where a file lives in the domain map: `app/<sub-domain>` under the app domain's sub-domains,
 * `app` at its root, `<domain>` for every other domain, null outside `src/domains/<domain>/`.
 */
export function areaOf(path: string): string | null {
  const parts = path.split('/');
  if (parts[0] !== 'src' || parts[1] !== 'domains' || parts.length < 4) return null;
  const domain = parts[2];
  if (!domain) return null;
  if (domain === 'app' && parts[3] === 'sub-domains' && parts.length > 5 && parts[4]) {
    return `app/${parts[4]}`;
  }
  return domain;
}

/** The folder that owns a file's tests: the nearest folder above it with a `__tests__/` child. */
function owningFolder(options: { repositoryRoot: string; file: string }): string | null {
  let directory = posix.dirname(options.file);
  while (directory.includes('/')) {
    if (existsSync(join(options.repositoryRoot, directory, '__tests__'))) return directory;
    directory = posix.dirname(directory);
  }
  return null;
}

/** Every file that reaches `start` through imports (`start` included). */
function importersClosure(options: {
  graph: ImportGraph;
  start: string;
  stopAt?: (file: string) => boolean;
}): Set<string> {
  const seen = new Set<string>([options.start]);
  const queue = [options.start];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (file !== options.start && options.stopAt?.(file)) continue;
    for (const importer of options.graph.importers.get(file) ?? []) {
      if (seen.has(importer)) continue;
      seen.add(importer);
      queue.push(importer);
    }
  }
  return seen;
}

/**
 * The wiring files: under `src/` but outside every app sub-domain, importing three or more areas
 * other than their own (`app.container.ts`, `app-record-tables.ts`, `worker-containers.ts`). Code
 * inside a sub-domain that imports other sub-domains is business code and never one; `tooling/`
 * reads all of `src/` on purpose (the OpenAPI schema map) and never holds one.
 */
export function findAggregators(graph: ImportGraph): Set<string> {
  const aggregators = new Set<string>();
  for (const [file, targets] of graph.imports) {
    if (isTestFile(file) || !file.startsWith('src/')) continue;
    const own = areaOf(file);
    if (own?.startsWith('app/')) continue;
    const areas = new Set<string>();
    for (const target of targets) {
      const area = areaOf(target);
      if (area && area !== own) areas.add(area);
    }
    if (areas.size >= AGGREGATOR_AREA_COUNT) aggregators.add(file);
  }
  return aggregators;
}

/** The test that owns a folder of tests: `<folder>/__tests__/…` → `<folder>`, else null. */
function testOwner(test: string): string | null {
  const parts = test.split('/');
  const index = parts.lastIndexOf('__tests__');
  return index > 0 ? parts.slice(0, index).join('/') : null;
}

/**
 * The files that reach a non-escalating source (a change the selection judges file by file)
 * through imports: every importer of one, transitively. With `stopped`, the walk follows the
 * selection's own rules — it never passes through the harness, nor through a wiring file it did
 * not start from (a wiring file's own change does select its importers).
 */
function reachingNonEscalatingSource(options: {
  graph: ImportGraph;
  aggregators: Set<string>;
  stopped: boolean;
}): Set<string> {
  const { graph, aggregators, stopped } = options;
  const isEscalating = (file: string) => matchesAny({ path: file, globs: ESCALATION_GLOBS });
  const starts = graph.files.filter((file) => !(isTestFile(file) || isEscalating(file)));
  const reached = new Set<string>(starts);
  const queue = [...starts];
  const startSet = new Set(starts);
  while (queue.length > 0) {
    const file = queue.shift() as string;
    const blocked =
      stopped &&
      !startSet.has(file) &&
      (aggregators.has(file) || matchesAny({ path: file, globs: HARNESS_GLOBS }));
    if (blocked) continue;
    for (const importer of graph.importers.get(file) ?? []) {
      if (reached.has(importer)) continue;
      reached.add(importer);
      queue.push(importer);
    }
  }
  return reached;
}

/**
 * The tests a change they depend on would not select: an app-booting test outside every domain
 * (it has no area for the domain map), or a test that reaches non-escalating code only through
 * the harness or a wiring file (the selection's import walk stops there) — in neither case under
 * a folder that owns it. They join the always-run set: the API contract and OpenAPI response
 * suites, the cross-cutting integration and performance suites, the composition-root test.
 *
 * @remarks
 * A test whose code is all on the escalation list is not one: any change to that code runs
 * everything. A test that imports nothing is always run already.
 */
export function findUnreachableTests(options: {
  graph: ImportGraph;
  booting: Set<string>;
  aggregators: Set<string>;
}): Set<string> {
  const { graph, booting, aggregators } = options;
  const anyPath = reachingNonEscalatingSource({ graph, aggregators, stopped: false });
  const selectionPath = reachingNonEscalatingSource({ graph, aggregators, stopped: true });
  const unreachable = new Set<string>();
  for (const test of graph.tests) {
    if (testOwner(test) || matchesAny({ path: test, globs: ALWAYS_RUN_GLOBS })) continue;
    const imports = [...(graph.imports.get(test) ?? [])];
    if (imports.every((target) => isTestFile(target))) continue;
    if (booting.has(test)) {
      if (!areaOf(test)) unreachable.add(test);
    } else if (anyPath.has(test) && !selectionPath.has(test)) {
      unreachable.add(test);
    }
  }
  return unreachable;
}

/**
 * The tests that load a container — a wiring file named for one (`app-records.container.ts`,
 * `worker-containers.ts`) — directly or through the harness: `app-record-service-contract.helper.ts`
 * builds every app record service through `app-records.container.ts`; the composition-root tests
 * import `worker-containers.ts`. Such a test fails as soon as anything the container wires fails to
 * load (a top-level error, a renamed export, an import cycle), so a change that reaches the
 * container selects it, though the import walk stops at the harness and at wiring files.
 *
 * @remarks
 * Found by the planted-break proof of 18 Oct 2026: a top-level throw in `leads.service.ts` failed
 * 41 unit test files of other sub-domains, and one in `webhook.service.ts` the worker-containers
 * composition test — all skipped by the selection. Only containers: following every wiring file a
 * test loads would select about half the unit suite for a billing change, where 12 test files broke.
 */
export function findContainerBuildingTests(options: {
  graph: ImportGraph;
  aggregators: Set<string>;
}): Map<string, Set<string>> {
  const { graph, aggregators } = options;
  const isHarness = (file: string) => matchesAny({ path: file, globs: HARNESS_GLOBS });
  const isContainer = (file: string) =>
    aggregators.has(file) && /container/.test(file.slice(file.lastIndexOf('/') + 1));
  const builders = new Map<string, Set<string>>();
  for (const test of graph.tests) {
    const seen = new Set<string>();
    const queue = [...(graph.imports.get(test) ?? [])];
    while (queue.length > 0) {
      const file = queue.shift() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      if (isContainer(file)) {
        const tests = builders.get(file) ?? new Set<string>();
        tests.add(test);
        builders.set(file, tests);
      } else if (isHarness(file)) queue.push(...(graph.imports.get(file) ?? []));
    }
  }
  return builders;
}

/** The graph's shared analysis, computed on first use. */
export function analyzeGraph(graph: ImportGraph): GraphAnalysis {
  if (!graph.analysis) {
    const booting = importersClosure({ graph, start: APP_ENTRY });
    const aggregators = findAggregators(graph);
    graph.analysis = {
      booting,
      aggregators,
      unreachable: findUnreachableTests({ graph, booting, aggregators }),
      containerTests: findContainerBuildingTests({ graph, aggregators }),
      texts: new Map(),
    };
  }
  return graph.analysis;
}

/** The Vitest project a test file belongs to, from `tooling/vitest/projects.ts`; null if none. */
export function projectOf(testFile: string): string | null {
  for (const project of vitestProjects) {
    const { name, include = [], exclude = [] } = project.test;
    if (!name) continue;
    if (!include.some((pattern) => matchesGlob(testFile, pattern))) continue;
    if (exclude.some((pattern) => matchesGlob(testFile, pattern))) continue;
    return name;
  }
  return null;
}

/** The path-like strings a test names: each literal, and each comma-separated run joined by `/`. */
function namedPaths(options: { test: string; source: string }): string[] {
  const paths = new Set<string>();
  for (const run of options.source.matchAll(LITERAL_RUN)) {
    const parts = [...run[0].matchAll(LITERAL)].map((literal) => literal[2] ?? '');
    for (const part of parts) paths.add(part);
    if (parts.length > 1) paths.add(parts.join('/'));
  }
  const resolved: string[] = [];
  for (const path of paths) {
    const trimmed = path.replace(/^\/+|\/+$/g, '');
    if (!(trimmed.includes('/') || trimmed.includes('.'))) continue;
    if (trimmed.startsWith('./') || trimmed.startsWith('../')) {
      resolved.push(posix.normalize(posix.join(posix.dirname(options.test), trimmed)));
    } else resolved.push(trimmed);
  }
  return resolved;
}

/** True when `test` names `changed`: the path, its file name, a folder above it, or a glob over it. */
function mentions(options: { changed: string; source: string; named: string[] }): boolean {
  const { changed } = options;
  const name = posix.basename(changed);
  if (options.source.includes(changed)) return true;
  if (name !== 'index.ts' && options.source.includes(name)) return true;
  return options.named.some((path) => {
    if (path.includes('*')) return matchesGlob(changed, path);
    return path.split('/').length >= 2 && changed.startsWith(`${path}/`);
  });
}

function matchesAny(options: { path: string; globs: string[] }): boolean {
  return options.globs.some((glob) => matchesGlob(options.path, glob));
}

/** How every always-run reason starts — the tests a source change selects whatever it is. */
export const ALWAYS_RUN_REASON = 'always run';

/** The always-run tests of a source change under `src/`, each with its reason. */
function alwaysRun(options: { graph: ImportGraph; unreachable: Set<string> }): [string, string][] {
  const tests: [string, string][] = [];
  for (const test of options.graph.tests) {
    if (matchesAny({ path: test, globs: ALWAYS_RUN_GLOBS })) tests.push([test, ALWAYS_RUN_REASON]);
    const reachesRepository = [...(options.graph.imports.get(test) ?? [])].some(
      (target) => !isTestFile(target),
    );
    if (!reachesRepository) {
      tests.push([test, `${ALWAYS_RUN_REASON} (imports nothing from the repository)`]);
    }
    if (options.unreachable.has(test)) {
      tests.push([test, `${ALWAYS_RUN_REASON} (no single source change selects it)`]);
    }
  }
  return tests;
}

/** Whether a test was selected only because it always runs (every reason is an always-run one). */
export function isAlwaysRunOnly(reasons: readonly string[]): boolean {
  return reasons.every((reason) => reason.startsWith(ALWAYS_RUN_REASON));
}

/** Keeps the selected tests that `keep` accepts; a project left empty is dropped. */
function filterSelection(options: {
  selection: TestSelection;
  keep: (test: string) => boolean;
  reason: string;
}): TestSelection {
  const { selection, keep } = options;
  if (selection.mode !== 'selected') return selection;
  const projects = Object.fromEntries(
    Object.entries(selection.projects)
      .map(([project, tests]) => [project, tests.filter(keep)] as const)
      .filter(([, tests]) => tests.length > 0),
  );
  const why = Object.fromEntries(Object.entries(selection.why).filter(([test]) => keep(test)));
  const left = Object.values(projects).flat().length;
  return {
    mode: left === 0 ? 'none' : 'selected',
    reasons: [...selection.reasons, `${options.reason} (${left} test files left)`],
    projects,
    why,
  };
}

/**
 * The part of a selection picked for the change itself — for an early signal next to a full suite.
 *
 * @remarks
 * Drops the tests selected only because they always run, and turns a selection of everything
 * into none: the full suite runs those anyway (PR CI's affected database tests run beside the
 * database matrix).
 */
export function changedOnly(selection: TestSelection): TestSelection {
  if (selection.mode === 'all') {
    return {
      mode: 'none',
      reasons: [...selection.reasons, 'everything is selected, so the full suite is the signal'],
      projects: {},
      why: {},
    };
  }
  return filterSelection({
    selection,
    keep: (test) => !isAlwaysRunOnly(selection.why[test] ?? []),
    reason: 'the always-run tests left to the full suite',
  });
}

/** The selection without the tests that match any of `globs` (`--exclude`). */
export function withoutTests(options: {
  selection: TestSelection;
  globs: readonly string[];
}): TestSelection {
  const { selection, globs } = options;
  if (globs.length === 0) return selection;
  return filterSelection({
    selection,
    keep: (test) => !globs.some((glob) => matchesGlob(test, glob)),
    reason: `excluded ${globs.join(', ')}`,
  });
}

function all(reason: string): TestSelection {
  return { mode: 'all', reasons: [reason], projects: {}, why: {} };
}

/**
 * Select the tests a set of changed files can affect (see the module comment for the rules).
 *
 * @remarks
 * Pure apart from reading the repository: the CLI (`tooling/vitest/select-tests.ts`) lists the
 * changed files from git and prints or runs the result. Any error selects everything.
 */
export function selectTests(options: {
  changedFiles: string[];
  repositoryRoot: string;
  graph?: ImportGraph;
  /** Only unit-level projects will run (pre-push): a migration selects the tests that read it. */
  unitLevel?: boolean;
}): TestSelection {
  try {
    return selectTestsOrThrow(options);
  } catch (error) {
    return all(`selector error, so everything runs: ${(error as Error).message}`);
  }
}

/** The changed migrations a unit-level selection narrows ({@link UNIT_LEVEL_NARROWED_GLOBS}). */
function narrowedMigrations(options: { changedFiles: string[]; unitLevel?: boolean }): string[] {
  if (!options.unitLevel) return [];
  return options.changedFiles.filter((file) =>
    matchesAny({ path: file, globs: UNIT_LEVEL_NARROWED_GLOBS }),
  );
}

/** Selects every test that reads the migrations ({@link READS_MIGRATIONS}) for each narrowed one. */
function selectMigrationReaders(options: {
  tests: string[];
  migrations: string[];
  source: (test: string) => string;
  select: (test: string, reason: string) => void;
}): void {
  if (options.migrations.length === 0) return;
  for (const test of options.tests) {
    if (!READS_MIGRATIONS.test(options.source(test))) continue;
    for (const migration of options.migrations)
      options.select(test, `reads migrations (${migration})`);
  }
}

/** A changed test: itself, and each test-source policy the repository has ({@link TEST_SOURCE_POLICIES}). */
function selectChangedTest(options: {
  changed: string;
  repositoryRoot: string;
  select: (test: string, reason: string) => void;
}): void {
  options.select(options.changed, 'the changed test itself');
  for (const policy of TEST_SOURCE_POLICIES) {
    if (policy !== options.changed && existsSync(join(options.repositoryRoot, policy))) {
      options.select(policy, `reads every test's source (${options.changed})`);
    }
  }
}

/** A changed code file under `src/` or `tooling/`: each source-scan policy the repository has ({@link SOURCE_SCAN_POLICIES}). */
function selectSourceScanPolicies(options: {
  changed: string;
  repositoryRoot: string;
  select: (test: string, reason: string) => void;
}): void {
  const inGraph = GRAPH_ROOTS.some((root) => options.changed.startsWith(`${root}/`));
  const isCode = CODE_EXTENSIONS.some((extension) => options.changed.endsWith(extension));
  if (!(inGraph && isCode)) return;
  for (const policy of SOURCE_SCAN_POLICIES) {
    if (existsSync(join(options.repositoryRoot, policy))) {
      options.select(policy, `reads every source file (${options.changed})`);
    }
  }
}

function selectTestsOrThrow(options: {
  changedFiles: string[];
  repositoryRoot: string;
  graph?: ImportGraph;
  unitLevel?: boolean;
}): TestSelection {
  const { repositoryRoot } = options;
  const changedFiles = [...new Set(options.changedFiles.map(toPosix))].filter(Boolean);
  if (changedFiles.length === 0) {
    return { mode: 'none', reasons: ['no changed files'], projects: {}, why: {} };
  }

  const migrations = narrowedMigrations({ changedFiles, unitLevel: options.unitLevel === true });
  const judged = changedFiles.filter((file) => !migrations.includes(file));
  for (const file of judged) {
    if (isTestFile(file)) continue;
    if (matchesAny({ path: file, globs: ESCALATION_GLOBS })) {
      return all(`${file} is on the escalation list, so everything runs`);
    }
    const known =
      GRAPH_ROOTS.some((root) => file.startsWith(`${root}/`)) ||
      matchesAny({ path: file, globs: MENTION_ONLY_GLOBS });
    if (!known) return all(`${file} is outside the known roots, so everything runs`);
  }

  const graph = options.graph ?? buildImportGraph(repositoryRoot);
  const { booting, aggregators, unreachable, texts, containerTests } = analyzeGraph(graph);
  const why = new Map<string, Set<string>>();
  const select = (test: string, reason: string) => {
    const reasons = why.get(test) ?? new Set<string>();
    reasons.add(reason);
    why.set(test, reasons);
  };

  const testText = (test: string) => {
    let entry = texts.get(test);
    if (!entry) {
      const source = readFileSync(join(repositoryRoot, test), 'utf8');
      entry = { source, named: namedPaths({ test, source }) };
      texts.set(test, entry);
    }
    return entry;
  };

  selectMigrationReaders({
    tests: graph.tests,
    migrations,
    source: (test) => testText(test).source,
    select,
  });

  let sourceChanged = false;
  for (const changed of judged) {
    const exists = existsSync(join(repositoryRoot, changed));
    if (isTestFile(changed)) {
      if (exists) selectChangedTest({ changed, repositoryRoot, select });
      continue;
    }
    const inGraph = GRAPH_ROOTS.some((root) => changed.startsWith(`${root}/`));
    const isCode = CODE_EXTENSIONS.some((extension) => changed.endsWith(extension));
    if (inGraph && !exists && !graph.importers.has(changed) && isCode) {
      return all(`${changed} was deleted and nothing imports it now, so everything runs`);
    }
    if (changed.startsWith('src/') && !changed.endsWith('.md')) sourceChanged = true;
    selectSourceScanPolicies({ changed, repositoryRoot, select });

    const owner = owningFolder({ repositoryRoot, file: changed });
    if (owner) {
      for (const test of graph.tests) {
        if (test.startsWith(`${owner}/`)) select(test, `next to ${changed}`);
      }
    }

    if (inGraph) {
      const harnessOrWiring = (file: string) =>
        aggregators.has(file) || matchesAny({ path: file, globs: HARNESS_GLOBS });
      for (const file of importersClosure({ graph, start: changed, stopAt: harnessOrWiring })) {
        if (isTestFile(file) && !booting.has(file)) select(file, `imports ${changed}`);
      }
      const reached = importersClosure({
        graph,
        start: changed,
        stopAt: (file) => aggregators.has(file),
      });
      for (const file of reached) {
        for (const test of containerTests.get(file) ?? []) {
          select(test, `loads ${file}, which wires ${changed}`);
        }
      }
      const areas = new Set<string>();
      for (const file of reached) {
        const area = areaOf(file);
        if (area && !isTestFile(file) && !aggregators.has(file)) areas.add(area);
      }
      for (const test of graph.tests) {
        if (!booting.has(test)) continue;
        const area = areaOf(test);
        if (area && areas.has(area)) select(test, `boots the app, in area ${area} (${changed})`);
      }
      const subDomains = [...areas]
        .filter((area) => area.startsWith('app/'))
        .map((area) => area.slice(4));
      for (const test of graph.tests) {
        if (!(booting.has(test) && test.startsWith('src/domains/app/'))) continue;
        const { source } = testText(test);
        const named = subDomains.find((subDomain) =>
          // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp — a sub-domain folder name from the repository, dashes escaped
          new RegExp(`\\b${subDomain.replace(/-/g, '\\-')}\\b`).test(source),
        );
        if (named) select(test, `an app test that names ${named} (${changed})`);
      }
    }

    for (const test of graph.tests) {
      const { source, named } = testText(test);
      if (mentions({ changed, source, named })) select(test, `mentions ${changed}`);
    }
  }

  if (sourceChanged) {
    for (const [test, reason] of alwaysRun({ graph, unreachable })) select(test, reason);
  }

  const projects: Record<string, string[]> = {};
  for (const test of [...why.keys()].sort()) {
    const project = projectOf(test);
    if (!project) {
      why.delete(test);
      continue;
    }
    projects[project] = [...(projects[project] ?? []), test];
  }
  if (why.size === 0) {
    return {
      mode: 'none',
      reasons: ['no test imports, boots or mentions a changed file'],
      projects,
      why: {},
    };
  }
  const counts = Object.entries(projects).map(([project, tests]) => `${project} ${tests.length}`);
  return {
    mode: 'selected',
    reasons: [`${why.size} of ${graph.tests.length} test files: ${counts.join(', ')}`],
    projects,
    why: Object.fromEntries([...why].map(([test, reasons]) => [test, [...reasons]])),
  };
}
