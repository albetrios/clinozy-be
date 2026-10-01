/**
 * Design-iteration generator (`pnpm iteration:new` / `pnpm iteration:list`).
 *
 * Pins the naming rules, the single-launch and launch-first refusals, the Baseline choice
 * (latest Opened on the base branch, merge order on a tie, working-tree fallback), the retry on a
 * suffix collision, and the `--both` sibling folder — the behaviour clinozy-fe's generator must
 * match. Git-backed cases run in throwaway repositories under the OS temp folder.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyStatusToReadme,
  buildIterationName,
  chooseBaseline,
  formatIterationTable,
  ITERATION_STATUSES,
  LOCAL_ITERATION_TEMPLATES,
  localDate,
  MAXIMUM_NAME_ATTEMPTS,
  parseIterationName,
  parseIterationReadme,
  parseNewIterationArguments,
  parseStatusArguments,
  planNewIteration,
  planStatusChange,
  randomIterationSuffix,
  readIterationListings,
  readIterationTemplate,
  renderIterationReadme,
  renderTemplate,
  resolveSiblingRoot,
  SCHEMA_ROUTES_HASH_LENGTH,
  SIBLING_ITERATION_TEMPLATES,
  schemaRoutesHash,
  siblingPackageName,
  validateStatusTransition,
  validateTypeAndTopic,
  writeIterationPlan,
} from '@tooling/iterations/iteration.util.js';
import { resolveGitMetadata } from '@tooling/setup/codegen/project-identity.util.js';
import { loadConfig } from '@tooling/setup/common/config.js';
import { gitEnvironmentWithoutInheritedRepository } from '@tooling/setup/common/git-environment.js';

const BASE_BRANCH = resolveGitMetadata(loadConfig()).defaultBranch;
const WORK_BRANCH = 'feat/iteration-work';
const TODAY = '2026-10-01';
const OWNER = 'Test Owner';
/** Commit times in these tests are offsets (seconds) from this Unix time. */
const COMMIT_EPOCH = 1_790_000_000;

const scratchFolders: string[] = [];

afterEach(() => {
  for (const folder of scratchFolders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function git(command: {
  readonly repositoryRoot: string;
  readonly gitArguments: readonly string[];
  readonly commitTime?: number;
}): string {
  const dates =
    command.commitTime === undefined
      ? {}
      : {
          GIT_AUTHOR_DATE: `@${COMMIT_EPOCH + command.commitTime} +0000`,
          GIT_COMMITTER_DATE: `@${COMMIT_EPOCH + command.commitTime} +0000`,
        };
  return execFileSync('git', [...command.gitArguments], {
    cwd: command.repositoryRoot,
    encoding: 'utf-8',
    env: { ...gitEnvironmentWithoutInheritedRepository(), ...dates },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function createRepository(packageName = 'demo-be'): string {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'iteration-unit-'));
  scratchFolders.push(repositoryRoot);
  git({ repositoryRoot, gitArguments: ['init', '-q', '-b', BASE_BRANCH] });
  git({ repositoryRoot, gitArguments: ['config', 'user.name', OWNER] });
  git({ repositoryRoot, gitArguments: ['config', 'user.email', 'owner@example.test'] });
  git({ repositoryRoot, gitArguments: ['config', 'commit.gpgsign', 'false'] });
  writeFileSync(join(repositoryRoot, 'package.json'), JSON.stringify({ name: packageName }));
  git({ repositoryRoot, gitArguments: ['add', '-A'] });
  git({ repositoryRoot, gitArguments: ['commit', '-q', '-m', 'initial'], commitTime: 1_000 });
  return repositoryRoot;
}

function addIteration(iteration: {
  readonly repositoryRoot: string;
  readonly name: string;
  readonly opened: string;
  readonly commitTime?: number;
}): void {
  const folder = join(iteration.repositoryRoot, 'iterations', iteration.name);
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, 'README.md'),
    `| Field | Value |\n| --- | --- |\n| Opened | ${iteration.opened} |\n`,
  );
  if (iteration.commitTime === undefined) return;
  git({ repositoryRoot: iteration.repositoryRoot, gitArguments: ['add', '-A'] });
  git({
    repositoryRoot: iteration.repositoryRoot,
    gitArguments: ['commit', '-q', '-m', `add ${iteration.name}`],
    commitTime: iteration.commitTime,
  });
}

function suffixSequence(suffixes: readonly string[]): () => string {
  let position = 0;
  return () => suffixes[Math.min(position++, suffixes.length - 1)] ?? 'zzzz';
}

describe('parseNewIterationArguments', () => {
  it('reads the type, topic and flags', () => {
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
  });

  it('treats --sibling <path> as --both', () => {
    const parsed = parseNewIterationArguments(['fix', 'rounding', '--sibling', '../other-fe']);
    expect(parsed.createInSibling).toBe(true);
    expect(parsed.siblingPath).toBe('../other-fe');
  });

  it('rejects --sibling without a path, unknown options and extra positionals', () => {
    expect(() => parseNewIterationArguments(['feat', 'x', '--sibling'])).toThrow(/needs a path/);
    expect(() => parseNewIterationArguments(['feat', 'x', '--sibling', '--dry-run'])).toThrow(
      /needs a path/,
    );
    expect(() => parseNewIterationArguments(['feat', 'x', '--force'])).toThrow(/Unknown option/);
    expect(() => parseNewIterationArguments(['feat', 'x', 'y'])).toThrow(/Too many arguments/);
  });
});

describe('validateTypeAndTopic', () => {
  it('accepts a launch without a topic and a feat with a kebab-case topic', () => {
    expect(validateTypeAndTopic({ type: 'launch', topic: undefined })).toEqual({
      type: 'launch',
      topic: undefined,
    });
    expect(validateTypeAndTopic({ type: 'change', topic: 'patient-consent' })).toEqual({
      type: 'change',
      topic: 'patient-consent',
    });
  });

  it('rejects an unknown type, a launch topic and a missing topic', () => {
    expect(() => validateTypeAndTopic({ type: 'release', topic: 'x' })).toThrow(/Unknown type/);
    expect(() => validateTypeAndTopic({ type: undefined, topic: undefined })).toThrow(
      /Unknown type/,
    );
    expect(() => validateTypeAndTopic({ type: 'launch', topic: 'clinic' })).toThrow(/no topic/);
    expect(() => validateTypeAndTopic({ type: 'fix', topic: undefined })).toThrow(/needs a topic/);
  });

  it.each([
    'returns2',
    'phase-two-2',
    'Pharmacy',
    'pharmacy_returns',
    '-returns',
    'returns-',
    'pharmacy--returns',
  ])('rejects the topic %s', (topic) => {
    expect(() => validateTypeAndTopic({ type: 'feat', topic })).toThrow(/no digits/);
  });
});

describe('iteration names', () => {
  it('builds and parses launch and topic names', () => {
    const launch = buildIterationName({
      type: 'launch',
      topic: undefined,
      opened: '2026-09-30',
      suffix: 'jxmr',
    });
    const feature = buildIterationName({
      type: 'feat',
      topic: 'pharmacy-returns',
      opened: '2026-10-06',
      suffix: 'kqzx',
    });
    expect(launch).toBe('launch-2026-09-30-jxmr');
    expect(feature).toBe('feat-pharmacy-returns-2026-10-06-kqzx');
    expect(parseIterationName(feature)).toEqual({
      type: 'feat',
      topic: 'pharmacy-returns',
      opened: '2026-10-06',
    });
    expect(parseIterationName(launch)?.topic).toBeUndefined();
  });

  it('does not recognise folders outside the pattern', () => {
    for (const name of [
      'a-launch',
      'v1',
      'feat-returns2-2026-10-06-kqzx',
      'feat-x-2026-10-06-KQZX',
    ]) {
      expect(parseIterationName(name)).toBeUndefined();
    }
  });

  it('draws four lowercase letters and formats the local date', () => {
    for (let draw = 0; draw < 50; draw += 1) expect(randomIterationSuffix()).toMatch(/^[a-z]{4}$/);
    expect(localDate(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
});

describe('README and templates', () => {
  const fields = {
    type: 'feat',
    topic: 'pharmacy-returns',
    owner: OWNER,
    opened: '2026-10-06',
    branch: 'feat/pharmacy-returns',
    baseline: 'launch-2026-09-30-jxmr',
    status: 'planning',
    summary: '—',
  };

  it('renders the README field table and reads it back', () => {
    const markdown = renderIterationReadme({
      name: 'feat-pharmacy-returns-2026-10-06-kqzx',
      fields,
    });
    expect(markdown.startsWith('# feat-pharmacy-returns-2026-10-06-kqzx\n')).toBe(true);
    const parsed = parseIterationReadme(markdown);
    expect([...parsed.keys()]).toEqual([
      'Type',
      'Topic',
      'Owner',
      'Opened',
      'Branch',
      'Baseline',
      'Status',
      'Summary',
    ]);
    expect(parsed.get('Baseline')).toBe('launch-2026-09-30-jxmr');
  });

  it('fills every placeholder in every template', () => {
    const values = { name: 'feat-pharmacy-returns-2026-10-06-kqzx', ...fields };
    for (const relativePath of new Set([
      ...LOCAL_ITERATION_TEMPLATES,
      ...SIBLING_ITERATION_TEMPLATES,
    ])) {
      const rendered = renderTemplate({ template: readIterationTemplate(relativePath), values });
      expect(rendered, relativePath).not.toMatch(/\{\{\w+\}\}/);
    }
  });

  it('refuses a placeholder it has no value for', () => {
    expect(() => renderTemplate({ template: 'Hello {{who}}', values: {} })).toThrow(/\{\{who\}\}/);
  });
});

describe('chooseBaseline', () => {
  it('prefers the latest Opened, then the newest commit, then the name', () => {
    expect(
      chooseBaseline([
        { name: 'launch-2026-09-30-jxmr', opened: '2026-09-30', lastCommitTime: 900 },
        { name: 'feat-a-2026-10-02-aaaa', opened: '2026-10-02', lastCommitTime: 100 },
      ]),
    ).toBe('feat-a-2026-10-02-aaaa');
    expect(
      chooseBaseline([
        { name: 'feat-b-2026-10-02-bbbb', opened: '2026-10-02', lastCommitTime: 200 },
        { name: 'feat-a-2026-10-02-aaaa', opened: '2026-10-02', lastCommitTime: 300 },
      ]),
    ).toBe('feat-a-2026-10-02-aaaa');
    expect(
      chooseBaseline([
        { name: 'feat-a-2026-10-02-aaaa', opened: '2026-10-02', lastCommitTime: 300 },
        { name: 'feat-b-2026-10-02-bbbb', opened: '2026-10-02', lastCommitTime: 300 },
      ]),
    ).toBe('feat-b-2026-10-02-bbbb');
    expect(chooseBaseline([])).toBeUndefined();
  });
});

describe('planNewIteration', () => {
  it('refuses anything but a launch while no iteration exists', () => {
    const repositoryRoot = createRepository();
    expect(() =>
      planNewIteration({
        repositoryRoot,
        baseBranch: BASE_BRANCH,
        type: 'feat',
        topic: 'returns',
        siblingRoot: undefined,
        today: TODAY,
      }),
    ).toThrow(/open the launch first/);
  });

  it('plans a launch with Baseline none and writes it only when asked', () => {
    const repositoryRoot = createRepository();
    const plan = planNewIteration({
      repositoryRoot,
      baseBranch: BASE_BRANCH,
      type: 'launch',
      topic: undefined,
      siblingRoot: undefined,
      today: TODAY,
      nextSuffix: () => 'jxmr',
    });
    expect(plan.name).toBe(`launch-${TODAY}-jxmr`);
    expect(plan.fields).toMatchObject({
      type: 'launch',
      topic: '—',
      owner: OWNER,
      opened: TODAY,
      branch: BASE_BRANCH,
      baseline: 'none',
      status: 'planning',
    });
    expect(plan.files.map((file) => file.path.slice(plan.localFolder.length + 1))).toEqual([
      ...LOCAL_ITERATION_TEMPLATES,
    ]);
    expect(existsSync(plan.localFolder)).toBe(false);

    writeIterationPlan(plan);
    expect(readFileSync(join(plan.localFolder, 'plans/product-plan.md'), 'utf-8')).toContain(
      plan.name,
    );
    expect(() => writeIterationPlan(plan)).toThrow(/already exists/);
  });

  it('refuses a second launch', () => {
    const repositoryRoot = createRepository();
    addIteration({ repositoryRoot, name: 'launch-2026-09-30-jxmr', opened: '2026-09-30' });
    expect(() =>
      planNewIteration({
        repositoryRoot,
        baseBranch: BASE_BRANCH,
        type: 'launch',
        topic: undefined,
        siblingRoot: undefined,
        today: TODAY,
      }),
    ).toThrow(/only ever one launch/);
  });

  it('takes the Baseline from the base branch and records the current branch', () => {
    const repositoryRoot = createRepository();
    addIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      opened: '2026-09-30',
      commitTime: 2_000,
    });
    addIteration({
      repositoryRoot,
      name: 'feat-a-2026-10-02-aaaa',
      opened: '2026-10-02',
      commitTime: 3_000,
    });
    git({ repositoryRoot, gitArguments: ['switch', '-q', '-c', WORK_BRANCH] });
    addIteration({ repositoryRoot, name: 'feat-local-2026-10-05-cccc', opened: '2026-10-05' });

    const plan = planNewIteration({
      repositoryRoot,
      baseBranch: BASE_BRANCH,
      type: 'fix',
      topic: 'rounding',
      siblingRoot: undefined,
      today: TODAY,
    });
    expect(plan.fields.baseline).toBe('feat-a-2026-10-02-aaaa');
    expect(plan.baselineOnBaseBranch).toBe(true);
    expect(plan.fields.branch).toBe(WORK_BRANCH);
    expect(plan.name).toMatch(new RegExp(`^fix-rounding-${TODAY}-[a-z]{4}$`));
  });

  it('breaks an Opened tie on the base branch by merge order', () => {
    const repositoryRoot = createRepository();
    addIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      opened: '2026-09-30',
      commitTime: 2_000,
    });
    addIteration({
      repositoryRoot,
      name: 'feat-zeta-2026-10-02-zzzz',
      opened: '2026-10-02',
      commitTime: 3_000,
    });
    addIteration({
      repositoryRoot,
      name: 'feat-alpha-2026-10-02-aaaa',
      opened: '2026-10-02',
      commitTime: 4_000,
    });

    const plan = planNewIteration({
      repositoryRoot,
      baseBranch: BASE_BRANCH,
      type: 'change',
      topic: 'consent',
      siblingRoot: undefined,
      today: TODAY,
    });
    expect(plan.fields.baseline).toBe('feat-alpha-2026-10-02-aaaa');
  });

  it('falls back to the working tree while the base branch holds no iteration', () => {
    const repositoryRoot = createRepository();
    git({ repositoryRoot, gitArguments: ['switch', '-q', '-c', WORK_BRANCH] });
    addIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      opened: '2026-09-30',
      commitTime: 2_000,
    });

    const plan = planNewIteration({
      repositoryRoot,
      baseBranch: BASE_BRANCH,
      type: 'feat',
      topic: 'demo-check',
      siblingRoot: undefined,
      today: TODAY,
    });
    expect(plan.fields.baseline).toBe('launch-2026-09-30-jxmr');
    expect(plan.baselineOnBaseBranch).toBe(false);
  });

  it('draws a new suffix while the name is taken, here or in the sibling', () => {
    const repositoryRoot = createRepository();
    const siblingRoot = createRepository('demo-fe');
    addIteration({ repositoryRoot, name: 'launch-2026-09-30-jxmr', opened: '2026-09-30' });
    addIteration({ repositoryRoot, name: `feat-returns-${TODAY}-aaaa`, opened: TODAY });
    addIteration({
      repositoryRoot: siblingRoot,
      name: `feat-returns-${TODAY}-bbbb`,
      opened: TODAY,
    });

    const plan = planNewIteration({
      repositoryRoot,
      baseBranch: BASE_BRANCH,
      type: 'feat',
      topic: 'returns',
      siblingRoot,
      today: TODAY,
      nextSuffix: suffixSequence(['aaaa', 'bbbb', 'cccc']),
    });
    expect(plan.name).toBe(`feat-returns-${TODAY}-cccc`);

    expect(() =>
      planNewIteration({
        repositoryRoot,
        baseBranch: BASE_BRANCH,
        type: 'feat',
        topic: 'returns',
        siblingRoot: undefined,
        today: TODAY,
        nextSuffix: () => 'aaaa',
      }),
    ).toThrow(new RegExp(`after ${MAXIMUM_NAME_ATTEMPTS} attempts`));
  });

  it('plans the sibling folder with README, PRD and schema-routes under --both', () => {
    const repositoryRoot = createRepository();
    const siblingRoot = createRepository('demo-fe');
    addIteration({ repositoryRoot, name: 'launch-2026-09-30-jxmr', opened: '2026-09-30' });

    const plan = planNewIteration({
      repositoryRoot,
      baseBranch: BASE_BRANCH,
      type: 'feat',
      topic: 'returns',
      siblingRoot,
      today: TODAY,
    });
    const siblingFolder = join(siblingRoot, 'iterations', plan.name);
    expect(plan.siblingFolder).toBe(siblingFolder);
    const siblingFiles = plan.files.filter((file) => file.path.startsWith(siblingFolder));
    expect(siblingFiles.map((file) => file.path.slice(siblingFolder.length + 1))).toEqual([
      ...SIBLING_ITERATION_TEMPLATES,
    ]);
    const localReadme = plan.files.find(
      (file) => file.path === join(plan.localFolder, 'README.md'),
    );
    expect(siblingFiles[0]?.content).toBe(localReadme?.content);
  });

  it('refuses a detached HEAD', () => {
    const repositoryRoot = createRepository();
    git({ repositoryRoot, gitArguments: ['checkout', '-q', '--detach'] });
    expect(() =>
      planNewIteration({
        repositoryRoot,
        baseBranch: BASE_BRANCH,
        type: 'launch',
        topic: undefined,
        siblingRoot: undefined,
        today: TODAY,
      }),
    ).toThrow(/detached/);
  });
});

describe('resolveSiblingRoot', () => {
  it('maps the package name -be → -fe next to this repository', () => {
    const parent = mkdtempSync(join(tmpdir(), 'iteration-sibling-'));
    scratchFolders.push(parent);
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
    expect(resolveSiblingRoot({ repositoryRoot, siblingPath: '../demo-fe' })).toBe(siblingRoot);
    expect(() => resolveSiblingRoot({ repositoryRoot, siblingPath: '../missing-fe' })).toThrow(
      /not found/,
    );
  });

  it('needs --sibling when the package name does not end in -be', () => {
    expect(siblingPackageName('demo-be')).toBe('demo-fe');
    expect(() => siblingPackageName('demo')).toThrow(/--sibling/);
  });
});

describe('readIterationListings', () => {
  it('lists every iteration oldest first as an aligned table', () => {
    const repositoryRoot = createRepository();
    for (const [name, type, opened, baseline] of [
      ['feat-returns-2026-10-06-kqzx', 'feat', '2026-10-06', 'launch-2026-09-30-jxmr'],
      ['launch-2026-09-30-jxmr', 'launch', '2026-09-30', 'none'],
    ] as const) {
      const folder = join(repositoryRoot, 'iterations', name);
      mkdirSync(folder, { recursive: true });
      writeFileSync(
        join(folder, 'README.md'),
        renderIterationReadme({
          name,
          fields: {
            type,
            topic: '—',
            owner: OWNER,
            opened,
            branch: WORK_BRANCH,
            baseline,
            status: 'planning',
            summary: '—',
          },
        }),
      );
    }
    mkdirSync(join(repositoryRoot, 'iterations', 'not-an-iteration'));

    const listings = readIterationListings(repositoryRoot);
    expect(listings.map((listing) => listing.name)).toEqual([
      'launch-2026-09-30-jxmr',
      'feat-returns-2026-10-06-kqzx',
    ]);
    const lines = formatIterationTable(listings).split('\n');
    expect(lines[0]).toMatch(
      /^\| Name +\| Type +\| Owner +\| Opened +\| Baseline +\| Status +\| schema-routes +\|$/,
    );
    expect(listings.every((listing) => listing.schemaRoutes === '—')).toBe(true);
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
  });
});

describe('schemaRoutesHash', () => {
  it('fingerprints schema-routes.md with the first hex characters of its sha256', () => {
    const folder = mkdtempSync(join(tmpdir(), 'iteration-hash-'));
    scratchFolders.push(folder);
    const path = join(folder, 'schema-routes.md');
    writeFileSync(path, '# schema-routes\n');
    const expected = createHash('sha256')
      .update('# schema-routes\n')
      .digest('hex')
      .slice(0, SCHEMA_ROUTES_HASH_LENGTH);
    expect(schemaRoutesHash(path)).toBe(expected);
    expect(expected).toHaveLength(12);
    expect(schemaRoutesHash(join(folder, 'missing.md'))).toBe('—');
  });
});

describe('parseStatusArguments', () => {
  it('reads the iteration, the status and an optional reason', () => {
    expect(parseStatusArguments(['launch-2026-09-30-jxmr', 'ready-for-approval'])).toEqual({
      iteration: 'launch-2026-09-30-jxmr',
      status: 'ready-for-approval',
      reason: undefined,
      help: false,
    });
    expect(parseStatusArguments(['x', 'planning', '--reason', 'scope changed']).reason).toBe(
      'scope changed',
    );
    expect(parseStatusArguments(['x', 'planning', '--reason=scope changed']).reason).toBe(
      'scope changed',
    );
  });

  it('rejects a reason without text, unknown options and extra positionals', () => {
    expect(() => parseStatusArguments(['x', 'planning', '--reason'])).toThrow(/needs text/);
    expect(() => parseStatusArguments(['x', 'planning', '--reason', '--force'])).toThrow(
      /needs text/,
    );
    expect(() => parseStatusArguments(['x', 'planning', '--force'])).toThrow(/Unknown option/);
    expect(() => parseStatusArguments(['x', 'planning', 'extra'])).toThrow(/Too many arguments/);
  });
});

describe('validateStatusTransition', () => {
  it('allows one step forward along the lifecycle', () => {
    for (let position = 0; position < ITERATION_STATUSES.length - 1; position += 1) {
      const from = ITERATION_STATUSES[position];
      const to = ITERATION_STATUSES[position + 1];
      if (from === undefined || to === undefined) continue;
      expect(() => validateStatusTransition({ from, to, reason: undefined })).not.toThrow();
    }
  });

  it('refuses skipped, backward and post-freeze moves', () => {
    expect(() =>
      validateStatusTransition({ from: 'planning', to: 'approved', reason: undefined }),
    ).toThrow(/allowed next status is ready-for-approval/);
    expect(() =>
      validateStatusTransition({ from: 'done', to: 'implementing', reason: 'x' }),
    ).toThrow(/Cannot move done → implementing/);
    expect(() => validateStatusTransition({ from: 'done', to: 'planning', reason: 'x' })).toThrow(
      /Cannot move/,
    );
    expect(() => validateStatusTransition({ from: 'frozen', to: 'planning', reason: 'x' })).toThrow(
      /never edited/,
    );
    expect(() =>
      validateStatusTransition({ from: 'planning', to: 'planning', reason: undefined }),
    ).toThrow(/Cannot move planning → planning/);
  });

  it.each(['ready-for-approval', 'approved', 'implementing'] as const)(
    'moves %s back to planning only with a reason',
    (from) => {
      expect(() => validateStatusTransition({ from, to: 'planning', reason: undefined })).toThrow(
        /needs --reason/,
      );
      expect(() =>
        validateStatusTransition({ from, to: 'planning', reason: 'scope changed' }),
      ).not.toThrow();
    },
  );
});

describe('applyStatusToReadme', () => {
  const readme = renderIterationReadme({
    name: 'feat-returns-2026-10-06-kqzx',
    fields: {
      type: 'feat',
      topic: 'returns',
      owner: OWNER,
      opened: '2026-10-06',
      branch: WORK_BRANCH,
      baseline: 'launch-2026-09-30-jxmr',
      status: 'planning',
      summary: '—',
    },
  });

  it('rewrites the Status row and starts a History section', () => {
    const updated = applyStatusToReadme({
      readme,
      status: 'ready-for-approval',
      historyEntry: '- 2026-10-07 · planning → ready-for-approval · — · Test Owner',
    });
    expect(parseIterationReadme(updated).get('Status')).toBe('ready-for-approval');
    expect(
      updated.endsWith(
        '## History\n\n- 2026-10-07 · planning → ready-for-approval · — · Test Owner\n',
      ),
    ).toBe(true);
  });

  it('appends to the History section without touching the sections after it', () => {
    const first = applyStatusToReadme({
      readme,
      status: 'ready-for-approval',
      historyEntry: '- one',
    });
    const withDrop = `${first}\n## Drop\n\n- Placed: 2026-10-06\n`;
    const second = applyStatusToReadme({
      readme: withDrop,
      status: 'approved',
      historyEntry: '- two',
    });
    expect(second).toContain('## History\n\n- one\n- two\n\n## Drop\n\n- Placed: 2026-10-06\n');
    expect(parseIterationReadme(second).get('Status')).toBe('approved');
  });

  it('refuses a README without a Status row', () => {
    expect(() =>
      applyStatusToReadme({ readme: '# x\n', status: 'approved', historyEntry: '- x' }),
    ).toThrow(/no "\| Status/);
  });
});

describe('planStatusChange', () => {
  function repositoryWithLaunch(status: string): string {
    const repositoryRoot = createRepository();
    const folder = join(repositoryRoot, 'iterations', 'launch-2026-09-30-jxmr');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'README.md'),
      renderIterationReadme({
        name: 'launch-2026-09-30-jxmr',
        fields: {
          type: 'launch',
          topic: '—',
          owner: OWNER,
          opened: '2026-09-30',
          branch: BASE_BRANCH,
          baseline: 'none',
          status,
          summary: '—',
        },
      }),
    );
    return repositoryRoot;
  }

  it('plans the README with the new Status and a signed History entry', () => {
    const repositoryRoot = repositoryWithLaunch('approved');
    const plan = planStatusChange({
      repositoryRoot,
      iteration: 'launch-2026-09-30-jxmr',
      status: 'planning',
      reason: 'scope changed',
      today: TODAY,
    });
    expect(plan.from).toBe('approved');
    expect(plan.historyEntry).toBe(`- ${TODAY} · approved → planning · scope changed · ${OWNER}`);
    expect(parseIterationReadme(plan.content).get('Status')).toBe('planning');
    expect(readFileSync(plan.readmePath, 'utf-8')).toContain('| Status | approved |');
  });

  it('refuses an unknown iteration, an unknown status and a refused move', () => {
    const repositoryRoot = repositoryWithLaunch('planning');
    const request = { repositoryRoot, reason: undefined, today: TODAY };
    expect(() =>
      planStatusChange({ ...request, iteration: 'feat-x-2026-10-01-abcd', status: 'approved' }),
    ).toThrow(/No iteration/);
    expect(() =>
      planStatusChange({ ...request, iteration: 'launch-2026-09-30-jxmr', status: 'shipped' }),
    ).toThrow(/Unknown status/);
    expect(() =>
      planStatusChange({ ...request, iteration: 'launch-2026-09-30-jxmr', status: 'done' }),
    ).toThrow(/Cannot move planning → done/);
  });
});
