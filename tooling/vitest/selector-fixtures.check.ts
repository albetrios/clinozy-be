/**
 * The test selection's fixtures, checked by `pnpm agent-os:check`:
 *
 * - **One per sub-domain**, generated from the layout: for every app sub-domain and each of its
 *   nested sub-domains, every billing and notify sub-domain and the upload domain, a change to
 *   its main file (its `*.service.ts`, else its first source file) selects every test under its
 *   folder.
 * - **The core domains** (tenancy, user, auth, audit) run everything.
 * - **The recorded ones** in `tooling/vitest/selector-fixtures.json` — each a miss the full PR
 *   suite found (`pnpm test:selector-misses`): the selection for `changed` holds `mustSelect`.
 * - **The unreachable tests** (no single source change selects them) are always run.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import {
  analyzeGraph,
  buildImportGraph,
  type ImportGraph,
  isTestFile,
  selectTests,
} from '@tooling/vitest/test-selection.util.js';

/** One recorded fixture of `tooling/vitest/selector-fixtures.json`. */
export interface SelectorFixture {
  name: string;
  changed: string[];
  mustSelect: string[];
}

const FIXTURES_FILE = 'tooling/vitest/selector-fixtures.json';
/** Folders whose sub-domains each get a generated fixture. */
const SUB_DOMAIN_PARENTS = [
  'src/domains/app/sub-domains',
  'src/domains/billing/sub-domains',
  'src/domains/notify/sub-domains',
];
/** Domains without sub-domains that get one fixture for the whole domain. */
const FLAT_DOMAINS = ['src/domains/upload'];
/** Folders inside a sub-domain that are layers, not nested sub-domains. */
const LAYER_FOLDERS = new Set(['__tests__', 'seed', 'events', 'queues', 'workers']);
/** One file in each core domain: a change there must run everything. */
const ESCALATING_FILES = [
  'src/domains/tenancy/tenancy.container.ts',
  'src/domains/user/user.container.ts',
  'src/domains/auth/auth.container.ts',
  'src/domains/audit/audit.service.ts',
];

/** The generated fixture of one sub-domain folder, or null when it has no source or no tests. */
function folderFixture(options: { graph: ImportGraph; folder: string }): SelectorFixture | null {
  const { graph, folder } = options;
  const own = graph.files.filter(
    (file) => posix.dirname(file) === folder && !isTestFile(file) && file.endsWith('.ts'),
  );
  const main = own.find((file) => file.endsWith('.service.ts')) ?? own.sort()[0];
  const tests = graph.tests.filter((test) => test.startsWith(`${folder}/`));
  if (!main || tests.length === 0) return null;
  return { name: `${posix.basename(folder)} (generated)`, changed: [main], mustSelect: tests };
}

/** The sub-domain folders directly under `parent` (layer folders excluded). */
function childFolders(options: { repositoryRoot: string; parent: string }): string[] {
  const absolute = join(options.repositoryRoot, options.parent);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !LAYER_FOLDERS.has(entry.name))
    .map((entry) => `${options.parent}/${entry.name}`);
}

function generatedFixtures(options: {
  graph: ImportGraph;
  repositoryRoot: string;
}): SelectorFixture[] {
  const { repositoryRoot } = options;
  const subDomains = SUB_DOMAIN_PARENTS.flatMap((parent) =>
    childFolders({ repositoryRoot, parent }),
  );
  const nested = subDomains.flatMap((parent) => childFolders({ repositoryRoot, parent }));
  const folders = [...subDomains, ...nested, ...FLAT_DOMAINS];
  return folders.flatMap((folder) => folderFixture({ graph: options.graph, folder }) ?? []);
}

function recordedFixtures(repositoryRoot: string): SelectorFixture[] {
  const path = join(repositoryRoot, FIXTURES_FILE);
  if (!existsSync(path)) return [];
  return (
    (JSON.parse(readFileSync(path, 'utf8')) as { fixtures?: SelectorFixture[] }).fixtures ?? []
  );
}

/**
 * Runs every fixture; returns one problem per fixture that fails, and the counts checked.
 *
 * @remarks
 * Builds the import graph once and reuses it (and its analysis) for every selection.
 */
export function checkSelectorFixtures(repositoryRoot: string): {
  problems: string[];
  fixtures: number;
  unreachable: number;
} {
  const graph = buildImportGraph(repositoryRoot);
  const problems: string[] = [];
  const generated = generatedFixtures({ graph, repositoryRoot });
  const fixtures = [...generated, ...recordedFixtures(repositoryRoot)];
  for (const fixture of fixtures) {
    const selection = selectTests({ changedFiles: fixture.changed, repositoryRoot, graph });
    if (selection.mode === 'all') continue;
    const selected = new Set(Object.values(selection.projects).flat());
    const missing = fixture.mustSelect.filter((test) => !selected.has(test));
    if (missing.length > 0) {
      problems.push(
        `${fixture.name}: a change to ${fixture.changed.join(', ')} does not select ${missing.length} test(s), e.g. ${missing.slice(0, 2).join(', ')}`,
      );
    }
  }
  for (const file of ESCALATING_FILES.filter((path) => existsSync(join(repositoryRoot, path)))) {
    const selection = selectTests({ changedFiles: [file], repositoryRoot, graph });
    if (selection.mode !== 'all')
      problems.push(`${file}: a core-domain change must run everything`);
  }
  const { unreachable } = analyzeGraph(graph);
  const sample = generated[0]?.changed ?? [];
  if (sample.length > 0) {
    const selection = selectTests({ changedFiles: sample, repositoryRoot, graph });
    const selected = new Set(Object.values(selection.projects).flat());
    const notRun = [...unreachable].filter((test) => !selected.has(test));
    if (selection.mode !== 'all' && notRun.length > 0) {
      problems.push(`${notRun.length} unreachable test(s) are not always run, e.g. ${notRun[0]}`);
    }
  }
  return { problems, fixtures: fixtures.length, unreachable: unreachable.size };
}
