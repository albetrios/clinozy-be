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
  BRIEF_SECTIONS,
  checkIntakeSet,
  intakeHash,
  missingBriefSections,
  recordedIntakeMode,
  recordedProcess,
  snapshotFingerprint,
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
  FINGERPRINT_LENGTH,
  schemaRoutesHash,
  setReadmeField,
  siblingPackageName,
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
        lite: false,
        dryRun: true,
        help: false,
      },
    );
    expect(parseNewIterationArguments(['fix', 'rounding', '--lite']).lite).toBe(true);
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
    process: 'full',
    topic: 'pharmacy-returns',
    owner: ITERATION_TEST_OWNER,
    opened: '2026-10-06',
    branch: 'feat/pharmacy-returns',
    baseline: 'launch-2026-09-30-jxmr',
    status: 'planning',
    summary: '—',
    dropPlaced: '—',
    dropSource: '—',
    intakeMode: '—',
    intakeNote: '—',
    schemaRoutes: '—',
    intakeHash: '—',
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
    expect(template.trimEnd().endsWith('| Intake hash | {{intakeHash}} |')).toBe(true);
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
    expect(schemaRoutesHash(path)).toBe(expected.slice(0, FINGERPRINT_LENGTH));
    expect(schemaRoutesHash(path)).toHaveLength(12);
    expect(schemaRoutesHash(join(folder, 'missing.md'))).toBe('—');
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

  it('opens a lite fix with Process lite, and refuses --lite on anything but a fix', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({ repositoryRoot, name: 'launch-2026-09-30-jxmr' });
    const plan = planNewIteration({
      ...request(repositoryRoot),
      type: 'fix',
      topic: 'rounding',
      lite: true,
    });
    expect(plan.fields.process).toBe('lite');
    expect(
      planNewIteration({ ...request(repositoryRoot), type: 'fix', topic: 'rounding' }).fields
        .process,
    ).toBe('full');
    expect(() =>
      planNewIteration({ ...request(repositoryRoot), type: 'feat', topic: 'returns', lite: true }),
    ).toThrow(/--lite is for a fix only/);
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

  it('opens from scratch (Baseline none) even after a done iteration, on the current branch', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      intake: COMPLETE_INTAKE,
      fields: { status: 'done' },
    });
    runTestGit({ repositoryRoot, gitArguments: ['switch', '-q', '-c', WORK_BRANCH] });
    const plan = planNewIteration({ ...request(repositoryRoot), type: 'fix', topic: 'rounding' });
    expect(plan.fields.baseline).toBe('none');
    expect(plan.fields.branch).toBe(WORK_BRANCH);
    expect(plan.name).toMatch(new RegExp(`^fix-rounding-${ITERATION_TEST_TODAY}-[a-z]{4}$`));
  });

  it('opens from scratch while nothing is done or frozen too', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({ repositoryRoot, name: 'launch-2026-09-30-jxmr' });
    const plan = planNewIteration({
      ...request(repositoryRoot),
      type: 'feat',
      topic: 'demo-check',
    });
    expect(plan.fields.baseline).toBe('none');
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

  it('opens the sibling folder too under --both, from scratch as well', () => {
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
    expect(plan.fields.baseline).toBe('none');
    expect(plan.siblingBaseline).toBe('none');
    const siblingReadme = plan.files.find(
      (file) => file.path === join(siblingRoot, 'iterations', plan.name, 'README.md'),
    );
    expect(parseIterationReadme(siblingReadme?.content ?? '').get('Baseline')).toBe('none');
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
      /^\| Name +\| Type +\| Owner +\| Opened +\| Baseline +\| Status +\| Intake mode +\| Schema-routes +\| Intake hash +\| Drop placed +\|$/,
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
    for (const from of ['ready-for-approval', 'approved', 'implementing', 'done'] as const) {
      expect(() => validateStatusTransition({ from, to: 'planning', reason: undefined })).toThrow(
        /needs --reason/,
      );
      expect(() => validateStatusTransition({ from, to: 'planning', reason: 'why' })).not.toThrow();
    }
  });

  it('moves a lite fix planning → implementing → done → frozen, and back only with a reason', () => {
    const lite = { process: 'lite' } as const;
    for (const [from, to] of [
      ['planning', 'implementing'],
      ['implementing', 'done'],
      ['done', 'frozen'],
    ] as const) {
      expect(() =>
        validateStatusTransition({ from, to, reason: undefined, ...lite }),
      ).not.toThrow();
    }
    expect(() =>
      validateStatusTransition({
        from: 'planning',
        to: 'ready-for-approval',
        reason: undefined,
        ...lite,
      }),
    ).toThrow(/a lite fix\). From planning the allowed next status is implementing/);
    expect(() =>
      validateStatusTransition({
        from: 'implementing',
        to: 'planning',
        reason: undefined,
        ...lite,
      }),
    ).toThrow(/needs --reason/);
    expect(() =>
      validateStatusTransition({ from: 'done', to: 'planning', reason: 'reopened', ...lite }),
    ).not.toThrow();
    expect(() =>
      validateStatusTransition({ from: 'planning', to: 'implementing', reason: undefined }),
    ).toThrow(/allowed next status is ready-for-approval/);
  });

  it('reads a README without a Process row as full, and a lite one as lite', () => {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      fields: { status: 'done' },
    });
    addTestIteration({
      repositoryRoot,
      name: 'fix-rounding-2026-10-06-kqzx',
      fields: { type: 'fix', process: 'lite', topic: 'rounding' },
    });
    const lite = planStatusChange({
      repositoryRoot,
      iteration: 'fix-rounding-2026-10-06-kqzx',
      status: 'implementing',
      reason: undefined,
      today: ITERATION_TEST_TODAY,
    });
    expect(parseIterationReadme(lite.content).get('Status')).toBe('implementing');
    const readmePath = join(repositoryRoot, 'iterations', 'launch-2026-09-30-jxmr', 'README.md');
    writeFileSync(readmePath, readFileSync(readmePath, 'utf-8').replace(/^\| Process \|.*\n/m, ''));
    expect(recordedProcess(parseIterationReadme(readFileSync(readmePath, 'utf-8')))).toBe('full');
  });

  it('refuses skipped, backward and post-freeze moves', () => {
    expect(() =>
      validateStatusTransition({ from: 'planning', to: 'approved', reason: undefined }),
    ).toThrow(/allowed next status is ready-for-approval/);
    expect(() =>
      validateStatusTransition({ from: 'done', to: 'implementing', reason: 'x' }),
    ).toThrow(/Cannot move/);
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

describe('the Intake hash (shared byte for byte with clinozy-fe)', () => {
  it('feeds name, NUL, bytes, NUL per file, names in code-unit order, and keeps 12 hex characters', () => {
    const files = new Map([
      ['a.md', Buffer.from('lower')],
      ['B.md', Buffer.from('upper')],
    ]);
    const expected = createHash('sha256');
    for (const name of ['B.md', 'a.md']) {
      expected.update(name);
      expected.update('\0');
      expected.update(files.get(name) ?? Buffer.alloc(0));
      expected.update('\0');
    }
    expect(snapshotFingerprint(files)).toBe(expected.digest('hex').slice(0, FINGERPRINT_LENGTH));
    expect(snapshotFingerprint(new Map())).toBe('—');
  });

  it('hashes the flat, visible files of a folder and changes on any edit', () => {
    const folder = createScratchFolder('iteration-intake-hash-');
    writeFileSync(join(folder, 'PRD.md'), '# PRD\n');
    writeFileSync(join(folder, 'schema-routes.md'), '# schema-routes\n');
    writeFileSync(join(folder, '.DS_Store'), 'ignored');
    mkdirSync(join(folder, 'nested'));
    writeFileSync(join(folder, 'nested', 'x.md'), 'ignored');
    const first = intakeHash(folder);
    expect(first).toMatch(/^[0-9a-f]{12}$/);
    writeFileSync(join(folder, 'PRD.md'), '# PRD (edited)\n');
    expect(intakeHash(folder)).not.toBe(first);
    expect(intakeHash(join(folder, 'missing'))).toBe('—');
  });
});

describe('the backend mandatory set, BRIEF.md sections and the recorded mode', () => {
  it('requires PRD.md and schema-routes.md (plus BRIEF.md in brief mode) and flags extras', () => {
    expect(checkIntakeSet({ names: ['PRD.md', 'schema-routes.md', 'design-overview.md'] })).toEqual(
      {
        missing: [],
        extras: [],
      },
    );
    expect(checkIntakeSet({ names: ['PRD.md', 'notes.txt'], mode: 'full' })).toEqual({
      missing: ['schema-routes.md'],
      extras: ['notes.txt'],
    });
    expect(
      checkIntakeSet({ names: ['PRD.md', 'schema-routes.md'], mode: 'brief' }).missing,
    ).toEqual(['BRIEF.md']);
    expect(
      checkIntakeSet({ names: ['PRD.md', 'schema-routes.md', 'BRIEF.md'], mode: 'overlay' }).extras,
    ).toEqual([]);
  });

  it('lists the BRIEF.md sections a brief lacks', () => {
    const complete = BRIEF_SECTIONS.map((section) => `## ${section}\n\nnone\n`).join('\n');
    expect(missingBriefSections(`# Brief — x\n\n${complete}`)).toEqual([]);
    expect(missingBriefSections('# Brief — x\n\n## What changes\n\n## Why\n')).toEqual([
      'Affected screens, entities and routes',
      'Rules',
      'Acceptance criteria',
      'Out of scope',
    ]);
    expect(missingBriefSections(readIterationTemplate('BRIEF.md'))).toEqual([]);
  });

  it('reads the Intake mode, defaulting to full', () => {
    expect(recordedIntakeMode(new Map([['Intake mode', 'overlay']]))).toBe('overlay');
    expect(recordedIntakeMode(new Map([['Intake mode', '—']]))).toBe('full');
    expect(recordedIntakeMode(new Map())).toBe('full');
  });
});
