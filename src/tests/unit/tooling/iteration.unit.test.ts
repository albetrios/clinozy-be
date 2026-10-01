/**
 * Design-iteration tooling — the shared core (`tooling/iterations/iteration.util.ts`).
 *
 * Pins the naming rules, the README template and its field rows, the History list, the
 * `iteration:new` refusals and per-repository Baseline suggestion, the listing, and the
 * `iteration:status` / `iteration:baseline` rules — the behaviour the frontend repository's
 * commands must match. Git-backed cases run in throwaway repositories.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addTestIteration,
  createIterationRepository,
  createScratchFolder,
  ITERATION_TEST_BASE_BRANCH,
  ITERATION_TEST_OWNER,
  ITERATION_TEST_TODAY,
  removeIterationRepositories,
  runTestGit,
} from '@/tests/helpers/iteration-repository.helper.js';
import {
  appendHistoryEntry,
  buildIterationName,
  formatIterationTable,
  ITERATION_STATUSES,
  localDate,
  MAXIMUM_NAME_ATTEMPTS,
  parseIterationName,
  parseIterationReadme,
  parseNewIterationArguments,
  parseStatusArguments,
  planBaselineChange,
  planNewIteration,
  planStatusChange,
  README_FIELD_LABELS,
  randomIterationSuffix,
  readIterationListings,
  readIterationTemplate,
  renderHistoryEntry,
  renderIterationReadme,
  renderTemplate,
  resolveSiblingRoot,
  SCHEMA_ROUTES_HASH_LENGTH,
  schemaRoutesHash,
  setReadmeField,
  siblingPackageName,
  suggestBaseline,
  validateStatusTransition,
  validateTypeAndTopic,
  writePlannedFiles,
} from '@tooling/iterations/iteration.util.js';

const WORK_BRANCH = 'feat/iteration-work';
/** The required set — an iteration needs it to serve as a Baseline. */
const COMPLETE_INTAKE = { 'PRD.md': '# PRD\n', 'schema-routes.md': '# schema-routes\n' };

afterEach(() => {
  removeIterationRepositories();
});

function suffixSequence(suffixes: readonly string[]): () => string {
  let position = 0;
  return () => suffixes[Math.min(position++, suffixes.length - 1)] ?? 'zzzz';
}

describe('parseNewIterationArguments', () => {
  it('reads the type, topic and flags; --sibling implies --both', () => {
    expect(parseNewIterationArguments(['feat', 'pharmacy-returns', '--both', '--dry-run'])).toEqual(
      {
        type: 'feat',
        topic: 'pharmacy-returns',
        createInSibling: true,
        siblingPath: undefined,
        dryRun: true,
        help: false,
      },
    );
    const parsed = parseNewIterationArguments(['fix', 'rounding', '--sibling', '../other-fe']);
    expect(parsed.createInSibling).toBe(true);
    expect(parsed.siblingPath).toBe('../other-fe');
  });

  it('rejects --sibling without a path, unknown options and extra positionals', () => {
    expect(() => parseNewIterationArguments(['feat', 'x', '--sibling'])).toThrow(/needs a path/);
    expect(() => parseNewIterationArguments(['feat', 'x', '--force'])).toThrow(/Unknown option/);
    expect(() => parseNewIterationArguments(['feat', 'x', 'y'])).toThrow(/Too many arguments/);
  });
});

describe('names', () => {
  it('validates the type and topic', () => {
    expect(validateTypeAndTopic({ type: 'launch', topic: undefined }).type).toBe('launch');
    expect(validateTypeAndTopic({ type: 'change', topic: 'patient-consent' }).topic).toBe(
      'patient-consent',
    );
    expect(() => validateTypeAndTopic({ type: 'release', topic: 'x' })).toThrow(/Unknown type/);
    expect(() => validateTypeAndTopic({ type: 'launch', topic: 'clinic' })).toThrow(/no topic/);
    expect(() => validateTypeAndTopic({ type: 'fix', topic: undefined })).toThrow(/needs a topic/);
  });

  it.each(['returns2', 'Pharmacy', 'pharmacy_returns', '-returns', 'pharmacy--returns'])(
    'rejects the topic %s',
    (topic) => {
      expect(() => validateTypeAndTopic({ type: 'feat', topic })).toThrow(/no digits/);
    },
  );

  it('builds and parses names; only the date carries digits', () => {
    const name = buildIterationName({
      type: 'feat',
      topic: 'pharmacy-returns',
      opened: '2026-10-06',
      suffix: 'kqzx',
    });
    expect(name).toBe('feat-pharmacy-returns-2026-10-06-kqzx');
    expect(parseIterationName(name)).toEqual({
      type: 'feat',
      topic: 'pharmacy-returns',
      opened: '2026-10-06',
    });
    expect(parseIterationName('launch-2026-09-30-jxmr')?.topic).toBeUndefined();
    for (const notAnIteration of ['a-launch', 'v1', 'feat-returns2-2026-10-06-kqzx']) {
      expect(parseIterationName(notAnIteration)).toBeUndefined();
    }
    for (let draw = 0; draw < 50; draw += 1) expect(randomIterationSuffix()).toMatch(/^[a-z]{4}$/);
    expect(localDate(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
});

describe('README', () => {
  const fields = {
    type: 'feat',
    topic: 'pharmacy-returns',
    owner: ITERATION_TEST_OWNER,
    opened: '2026-10-06',
    branch: 'feat/pharmacy-returns',
    baseline: 'launch-2026-09-30-jxmr',
    status: 'planning',
    summary: '—',
    dropPlaced: '—',
    dropSource: '—',
    schemaRoutes: '—',
  };

  it('renders exactly the field rows, in order, and reads them back', () => {
    const markdown = renderIterationReadme({
      name: 'feat-pharmacy-returns-2026-10-06-kqzx',
      fields,
    });
    expect(markdown.startsWith('# feat-pharmacy-returns-2026-10-06-kqzx\n')).toBe(true);
    const parsed = parseIterationReadme(markdown);
    expect([...parsed.keys()]).toEqual([...README_FIELD_LABELS]);
    expect(parsed.get('Drop placed')).toBe('—');
    expect(markdown).not.toMatch(/\{\{\w+\}\}/);
  });

  it('keeps the template a bare table — one row per label, nothing after it', () => {
    const template = readIterationTemplate('README.md');
    const rows = template
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('| ---'));
    expect(rows.map((row) => row.split('|')[1]?.trim())).toEqual(['Field', ...README_FIELD_LABELS]);
    expect(template.trimEnd().endsWith('| Schema-routes | {{schemaRoutes}} |')).toBe(true);
  });

  it('refuses a placeholder it has no value for', () => {
    expect(() => renderTemplate({ template: 'Hello {{who}}', values: {} })).toThrow(/\{\{who\}\}/);
  });

  it('sets one row and leaves the others, including labels with spaces and hyphens', () => {
    const markdown = renderIterationReadme({ name: 'x', fields });
    const updated = setReadmeField({
      readme: markdown,
      label: 'Drop source',
      value: '~/Downloads',
    });
    expect(parseIterationReadme(updated).get('Drop source')).toBe('~/Downloads');
    expect(parseIterationReadme(updated).get('Drop placed')).toBe('—');
    expect(() => setReadmeField({ readme: '# x\n', label: 'Status', value: 'done' })).toThrow(
      /no "\| Status/,
    );
  });

  it('formats and appends History lines without touching later sections', () => {
    expect(
      renderHistoryEntry({
        date: '2026-10-07',
        change: 'approved → planning',
        reason: 'scope\n changed',
        owner: ITERATION_TEST_OWNER,
      }),
    ).toBe('- 2026-10-07 · approved → planning · scope changed · Test Owner');
    const first = appendHistoryEntry({ readme: '# x\n\n| Status | a |\n', historyEntry: '- one' });
    expect(first.endsWith('## History\n\n- one\n')).toBe(true);
    const withDrop = `${first}\n## Drop\n\n- Placed: 2026-10-06\n`;
    expect(appendHistoryEntry({ readme: withDrop, historyEntry: '- two' })).toContain(
      '## History\n\n- one\n- two\n\n## Drop\n',
    );
  });
});

describe('schemaRoutesHash', () => {
  it('is the first 12 hex characters of the sha256 of the bytes, or — when missing', () => {
    const folder = createScratchFolder('iteration-hash-');
    const path = join(folder, 'schema-routes.md');
    writeFileSync(path, '# schema-routes\n');
    const expected = createHash('sha256').update('# schema-routes\n').digest('hex');
    expect(schemaRoutesHash(path)).toBe(expected.slice(0, SCHEMA_ROUTES_HASH_LENGTH));
    expect(schemaRoutesHash(path)).toHaveLength(12);
    expect(schemaRoutesHash(join(folder, 'missing.md'))).toBe('—');
  });
});

describe('suggestBaseline', () => {
  it('suggests the done or frozen iteration that finished last, never an unfinished one', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      intake: COMPLETE_INTAKE,
      fields: { status: 'frozen' },
    });
    addTestIteration({
      repositoryRoot,
      name: 'feat-alpha-2026-10-02-aaaa',
      intake: COMPLETE_INTAKE,
      fields: { type: 'feat', opened: '2026-10-02', status: 'done' },
      history: ['- 2026-10-09 · implementing → done · — · Test Owner'],
    });
    addTestIteration({
      repositoryRoot,
      name: 'feat-beta-2026-10-03-bbbb',
      intake: COMPLETE_INTAKE,
      fields: { type: 'feat', opened: '2026-10-03', status: 'done' },
      history: ['- 2026-10-05 · implementing → done · — · Test Owner'],
    });
    addTestIteration({
      repositoryRoot,
      name: 'feat-gamma-2026-10-04-cccc',
      fields: { type: 'feat', opened: '2026-10-04', status: 'implementing' },
    });
    expect(suggestBaseline({ repositoryRoot })).toBe('feat-alpha-2026-10-02-aaaa');
    expect(suggestBaseline({ repositoryRoot, excluding: 'feat-alpha-2026-10-02-aaaa' })).toBe(
      'feat-beta-2026-10-03-bbbb',
    );
  });

  it('skips a done iteration whose intake-files/ lacks the required set', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      fields: { status: 'done' },
      intake: { 'PRD.md': '# PRD\n' },
    });
    expect(suggestBaseline({ repositoryRoot })).toBeUndefined();
  });

  it('suggests nothing while no iteration is done or frozen', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({ repositoryRoot, name: 'launch-2026-09-30-jxmr' });
    expect(suggestBaseline({ repositoryRoot })).toBeUndefined();
  });
});

describe('planNewIteration', () => {
  const request = (repositoryRoot: string) => ({
    repositoryRoot,
    baseBranch: ITERATION_TEST_BASE_BRANCH,
    siblingRoot: undefined,
    today: ITERATION_TEST_TODAY,
  });

  it('refuses anything but a launch while no iteration exists, and a second launch', () => {
    const repositoryRoot = createIterationRepository();
    expect(() =>
      planNewIteration({ ...request(repositoryRoot), type: 'feat', topic: 'returns' }),
    ).toThrow(/open the launch first/);
    addTestIteration({ repositoryRoot, name: 'launch-2026-09-30-jxmr' });
    expect(() =>
      planNewIteration({ ...request(repositoryRoot), type: 'launch', topic: undefined }),
    ).toThrow(/only ever one launch/);
  });

  it('opens a launch with its README only — Baseline none, the drop rows empty', () => {
    const repositoryRoot = createIterationRepository();
    const plan = planNewIteration({
      ...request(repositoryRoot),
      type: 'launch',
      topic: undefined,
      nextSuffix: () => 'jxmr',
    });
    expect(plan.name).toBe(`launch-${ITERATION_TEST_TODAY}-jxmr`);
    expect(plan.files.map((file) => file.path)).toEqual([join(plan.localFolder, 'README.md')]);
    expect(plan.fields).toMatchObject({
      baseline: 'none',
      status: 'planning',
      owner: ITERATION_TEST_OWNER,
      dropPlaced: '—',
      schemaRoutes: '—',
    });
    expect(existsSync(plan.localFolder)).toBe(false);
    writePlannedFiles(plan.files);
    const written = readFileSync(join(plan.localFolder, 'README.md'), 'utf-8');
    expect(parseIterationReadme(written).get('Type')).toBe('launch');
    expect(() => writePlannedFiles(plan.files)).toThrow(/already exists/);
  });

  it('suggests the latest done iteration as Baseline and records the current branch', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      intake: COMPLETE_INTAKE,
      fields: { status: 'done' },
    });
    runTestGit({ repositoryRoot, gitArguments: ['switch', '-q', '-c', WORK_BRANCH] });
    const plan = planNewIteration({ ...request(repositoryRoot), type: 'fix', topic: 'rounding' });
    expect(plan.fields.baseline).toBe('launch-2026-09-30-jxmr');
    expect(plan.fields.branch).toBe(WORK_BRANCH);
    expect(plan.name).toMatch(new RegExp(`^fix-rounding-${ITERATION_TEST_TODAY}-[a-z]{4}$`));
  });

  it('leaves the Baseline unconfirmed (—) while nothing is done or frozen', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({ repositoryRoot, name: 'launch-2026-09-30-jxmr' });
    const plan = planNewIteration({
      ...request(repositoryRoot),
      type: 'feat',
      topic: 'demo-check',
    });
    expect(plan.fields.baseline).toBe('—');
  });

  it('draws a new suffix while the name is taken here or in the sibling, then gives up', () => {
    const repositoryRoot = createIterationRepository();
    const siblingRoot = createIterationRepository('demo-fe');
    addTestIteration({ repositoryRoot, name: 'launch-2026-09-30-jxmr' });
    addTestIteration({
      repositoryRoot,
      name: `feat-returns-${ITERATION_TEST_TODAY}-aaaa`,
      fields: { type: 'feat' },
    });
    addTestIteration({
      repositoryRoot: siblingRoot,
      name: `feat-returns-${ITERATION_TEST_TODAY}-bbbb`,
      fields: { type: 'feat' },
    });
    const plan = planNewIteration({
      ...request(repositoryRoot),
      siblingRoot,
      type: 'feat',
      topic: 'returns',
      nextSuffix: suffixSequence(['aaaa', 'bbbb', 'cccc']),
    });
    expect(plan.name).toBe(`feat-returns-${ITERATION_TEST_TODAY}-cccc`);
    expect(() =>
      planNewIteration({
        ...request(repositoryRoot),
        type: 'feat',
        topic: 'returns',
        nextSuffix: () => 'aaaa',
      }),
    ).toThrow(new RegExp(`after ${MAXIMUM_NAME_ATTEMPTS} attempts`));
  });

  it("opens the sibling folder too under --both, with the sibling's own Baseline suggestion", () => {
    const repositoryRoot = createIterationRepository();
    const siblingRoot = createIterationRepository('demo-fe');
    addTestIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      intake: COMPLETE_INTAKE,
      fields: { status: 'done' },
    });
    addTestIteration({ repositoryRoot: siblingRoot, name: 'launch-2026-09-30-jxmr' });
    const plan = planNewIteration({
      ...request(repositoryRoot),
      siblingRoot,
      type: 'feat',
      topic: 'returns',
    });
    expect(plan.fields.baseline).toBe('launch-2026-09-30-jxmr');
    expect(plan.siblingBaseline).toBe('—');
    const siblingReadme = plan.files.find(
      (file) => file.path === join(siblingRoot, 'iterations', plan.name, 'README.md'),
    );
    expect(parseIterationReadme(siblingReadme?.content ?? '').get('Baseline')).toBe('—');
  });

  it('refuses a detached HEAD', () => {
    const repositoryRoot = createIterationRepository();
    runTestGit({ repositoryRoot, gitArguments: ['checkout', '-q', '--detach'] });
    expect(() =>
      planNewIteration({ ...request(repositoryRoot), type: 'launch', topic: undefined }),
    ).toThrow(/detached/);
  });
});

describe('resolveSiblingRoot', () => {
  it('maps the package name -be ↔ -fe next to this repository', () => {
    const parent = createScratchFolder('iteration-sibling-');
    const repositoryRoot = join(parent, 'demo-be');
    const siblingRoot = join(parent, 'demo-fe');
    for (const [root, name] of [
      [repositoryRoot, 'demo-be'],
      [siblingRoot, 'demo-fe'],
    ] as const) {
      mkdirSync(root);
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name }));
    }
    expect(resolveSiblingRoot({ repositoryRoot, siblingPath: undefined })).toBe(siblingRoot);
    expect(resolveSiblingRoot({ repositoryRoot: siblingRoot, siblingPath: undefined })).toBe(
      repositoryRoot,
    );
    expect(() => resolveSiblingRoot({ repositoryRoot, siblingPath: '../missing-fe' })).toThrow(
      /not found/,
    );
    expect(siblingPackageName('demo-be')).toBe('demo-fe');
    expect(siblingPackageName('demo-fe')).toBe('demo-be');
    expect(() => siblingPackageName('demo')).toThrow(/--sibling/);
  });
});

describe('readIterationListings', () => {
  it('lists the eight columns, oldest first, hashing intake-files/schema-routes.md', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: 'feat-returns-2026-10-06-kqzx',
      fields: { type: 'feat', opened: '2026-10-06', baseline: 'launch-2026-09-30-jxmr' },
    });
    addTestIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      fields: { dropPlaced: '2026-10-01' },
      intake: { 'schema-routes.md': '# schema-routes\n' },
    });
    mkdirSync(join(repositoryRoot, 'iterations', 'not-an-iteration'));
    const listings = readIterationListings(repositoryRoot);
    expect(listings.map((listing) => listing.name)).toEqual([
      'launch-2026-09-30-jxmr',
      'feat-returns-2026-10-06-kqzx',
    ]);
    expect(listings[0]?.schemaRoutes).toBe(
      createHash('sha256').update('# schema-routes\n').digest('hex').slice(0, 12),
    );
    expect(listings[0]?.dropPlaced).toBe('2026-10-01');
    expect(listings[1]?.schemaRoutes).toBe('—');
    const lines = formatIterationTable(listings).split('\n');
    expect(lines[0]).toMatch(
      /^\| Name +\| Type +\| Owner +\| Opened +\| Baseline +\| Status +\| Schema-routes +\| Drop placed +\|$/,
    );
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
  });
});

describe('iteration:status', () => {
  it('parses the iteration, status and reason', () => {
    expect(parseStatusArguments(['x', 'planning', '--reason', 'scope changed']).reason).toBe(
      'scope changed',
    );
    expect(parseStatusArguments(['x', 'planning', '--reason=why']).reason).toBe('why');
    expect(() => parseStatusArguments(['x', 'planning', '--reason'])).toThrow(/needs text/);
    expect(() => parseStatusArguments(['x', 'planning', 'extra'])).toThrow(/Too many/);
  });

  it('allows one step forward, and back to planning only with a reason', () => {
    for (let position = 0; position < ITERATION_STATUSES.length - 1; position += 1) {
      const from = ITERATION_STATUSES[position];
      const to = ITERATION_STATUSES[position + 1];
      if (from === undefined || to === undefined) continue;
      expect(() => validateStatusTransition({ from, to, reason: undefined })).not.toThrow();
    }
    for (const from of ['ready-for-approval', 'approved', 'implementing'] as const) {
      expect(() => validateStatusTransition({ from, to: 'planning', reason: undefined })).toThrow(
        /needs --reason/,
      );
      expect(() => validateStatusTransition({ from, to: 'planning', reason: 'why' })).not.toThrow();
    }
  });

  it('refuses skipped, backward and post-freeze moves', () => {
    expect(() =>
      validateStatusTransition({ from: 'planning', to: 'approved', reason: undefined }),
    ).toThrow(/allowed next status is ready-for-approval/);
    expect(() => validateStatusTransition({ from: 'done', to: 'planning', reason: 'x' })).toThrow(
      /Cannot move/,
    );
    expect(() => validateStatusTransition({ from: 'frozen', to: 'planning', reason: 'x' })).toThrow(
      /never edited/,
    );
  });

  it('plans the new Status row and a signed History line', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      fields: { status: 'approved' },
    });
    const plan = planStatusChange({
      repositoryRoot,
      iteration: 'launch-2026-09-30-jxmr',
      status: 'planning',
      reason: 'scope changed',
      today: ITERATION_TEST_TODAY,
    });
    expect(plan.historyEntry).toBe(
      `- ${ITERATION_TEST_TODAY} · approved → planning · scope changed · ${ITERATION_TEST_OWNER}`,
    );
    expect(parseIterationReadme(plan.content).get('Status')).toBe('planning');
    expect(plan.content).toContain(`## History\n\n${plan.historyEntry}\n`);
    expect(() =>
      planStatusChange({
        repositoryRoot,
        iteration: 'launch-2026-09-30-jxmr',
        status: 'shipped',
        reason: undefined,
      }),
    ).toThrow(/Unknown status/);
    expect(() =>
      planStatusChange({
        repositoryRoot,
        iteration: 'feat-x-2026-10-01-abcd',
        status: 'done',
        reason: undefined,
      }),
    ).toThrow(/No iteration/);
  });
});

describe('iteration:baseline', () => {
  function repository(): string {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      intake: COMPLETE_INTAKE,
      fields: { status: 'done' },
    });
    addTestIteration({
      repositoryRoot,
      name: 'feat-returns-2026-10-06-kqzx',
      fields: { type: 'feat', opened: '2026-10-06', baseline: '—' },
    });
    addTestIteration({
      repositoryRoot,
      name: 'feat-later-2026-10-09-zzzz',
      fields: { type: 'feat', opened: '2026-10-09', baseline: '—' },
    });
    return repositoryRoot;
  }

  it('records an earlier iteration (or none) with a History line', () => {
    const repositoryRoot = repository();
    const plan = planBaselineChange({
      repositoryRoot,
      iteration: 'feat-returns-2026-10-06-kqzx',
      baseline: 'launch-2026-09-30-jxmr',
      today: ITERATION_TEST_TODAY,
    });
    expect(parseIterationReadme(plan.content).get('Baseline')).toBe('launch-2026-09-30-jxmr');
    expect(plan.historyEntry).toBe(
      `- ${ITERATION_TEST_TODAY} · Baseline — → launch-2026-09-30-jxmr · — · ${ITERATION_TEST_OWNER}`,
    );
    const toNone = planBaselineChange({
      repositoryRoot,
      iteration: 'feat-returns-2026-10-06-kqzx',
      baseline: 'none',
    });
    expect(toNone.to).toBe('none');
  });

  it('refuses itself, a later iteration, an unknown one and an unchanged Baseline', () => {
    const repositoryRoot = repository();
    const iteration = 'feat-returns-2026-10-06-kqzx';
    for (const baseline of [iteration, 'feat-later-2026-10-09-zzzz', 'feat-nope-2026-10-01-abcd']) {
      expect(() => planBaselineChange({ repositoryRoot, iteration, baseline })).toThrow(
        /earlier iteration/,
      );
    }
    expect(() =>
      planBaselineChange({ repositoryRoot, iteration: 'launch-2026-09-30-jxmr', baseline: 'none' }),
    ).toThrow(/already has Baseline none/);
  });

  it('refuses a Baseline without a complete intake-files/ — the delta is a diff of intake-files/', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      fields: { status: 'done' },
    });
    addTestIteration({
      repositoryRoot,
      name: 'feat-returns-2026-10-06-kqzx',
      fields: { type: 'feat', opened: '2026-10-06', baseline: '—' },
    });
    expect(() =>
      planBaselineChange({
        repositoryRoot,
        iteration: 'feat-returns-2026-10-06-kqzx',
        baseline: 'launch-2026-09-30-jxmr',
      }),
    ).toThrow(/no complete intake-files\/ \(missing PRD\.md, schema-routes\.md\)/);
  });
});
