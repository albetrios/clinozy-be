import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ACTION_USE = 'uses: ./.github/actions/ci-failure-issue';
const SCRIPT = '.github/actions/ci-failure-issue/ci-failure-issue.sh';
const WORKFLOWS = '.github/workflows';

// Scheduled housekeeping whose only job is deleting old caches/images: a red run there has no
// "check" to report, so it carries no ci-failure issue.
const HOUSEKEEPING = new Set(['cleanup-cache.yml', 'cleanup-ghcr.yml']);

const workflowFiles = readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml'));
const workflowText = (name: string): string => readFileSync(join(WORKFLOWS, name), 'utf8');

/** Every scheduled check plus post-merge CI: the runs nobody watches as they finish. */
const alertedWorkflows = [
  ...workflowFiles.filter(
    (name) => /^ {2}schedule:/m.test(workflowText(name)) && !HOUSEKEEPING.has(name),
  ),
  'post-merge-ci.yml',
];

/** The top-level jobs of a workflow, as `[name, block]` (two-space keys under `jobs:`). */
function jobBlocks(text: string): Array<[string, string]> {
  const jobs = text.slice(text.indexOf('\njobs:\n'));
  const parts = jobs.split(/^ {2}([a-z][a-z-]*):\n/m).slice(1);
  const blocks: Array<[string, string]> = [];
  for (let index = 0; index + 1 < parts.length; index += 2) {
    blocks.push([parts[index] ?? '', parts[index + 1] ?? '']);
  }
  return blocks;
}

/** The `title:` of each action step in the given mode. */
function titles(text: string, mode: 'open' | 'close'): string[] {
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp — test helper: mode is the literal 'open' or 'close'
  return [...text.matchAll(new RegExp(`mode: ${mode}\\n\\s+title: (.+)`, 'g'))].map(
    (match) => match[1] ?? '',
  );
}

/**
 * Locks in one failure alert for every scheduled and post-merge check: a red run opens (or
 * comments on) one `ci-failure` issue per check through the shared action, and the next green run
 * closes it — so an open issue means the check is red right now.
 */
describe('ci-failure issue alert', () => {
  let directory = '';
  let state = '';
  let log = '';

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'ci-failure-issue-'));
    state = join(directory, 'open-issue');
    log = join(directory, 'gh.log');
    // A stand-in `gh`: logs each call; `issue list` prints the open issue number, if any; `api`
    // answers the fix plan's three reads from GH_FIXTURES (and fails when it is unset).
    const stub = join(directory, 'gh');
    writeFileSync(
      stub,
      [
        '#!/usr/bin/env bash',
        'echo "$*" >> "$GH_LOG"',
        'case "$1 $2" in',
        '  "issue list") [ -f "$GH_STATE" ] && cat "$GH_STATE"; exit 0 ;;',
        '  "issue create") echo 7 > "$GH_STATE" ;;',
        '  "issue close") rm -f "$GH_STATE" ;;',
        'esac',
        'if [ "$1" = api ]; then',
        '  case "$2" in',
        '    */actions/runs/*/jobs*) cat "$GH_FIXTURES/jobs.json" ;;',
        '    */actions/jobs/*/logs) cat "$GH_FIXTURES/job.log" ;;',
        '    */contents/agent-os/hooks/skill-routing.json*) cat "$GH_FIXTURES/routes.json" ;;',
        '    *) exit 1 ;;',
        '  esac',
        'fi',
        '',
      ].join('\n'),
    );
    chmodSync(stub, 0o755);
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function run(
    mode: string,
    extra: Record<string, string> = {},
  ): { status: number | null; output: string } {
    const result = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        GH_LOG: log,
        GH_STATE: state,
        GH_REPOSITORY: 'owner/repository',
        MODE: mode,
        TITLE: 'Weekly chaos suite failing',
        BODY: 'What failed.',
        CLOSE_COMMENT: 'Green again.',
        WORKFLOW_URL: 'https://github.com/owner/repository/actions/runs/42',
        ...extra,
      },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  }

  const ghLog = (): string => readFileSync(log, 'utf8');
  const runLink = 'Run: https://github.com/owner/repository/actions/runs/42';

  it('opens one issue, comments on it after that, and closes it on the next green run', () => {
    expect(run('open').status).toBe(0);
    expect(ghLog()).toContain(
      `issue create --repo owner/repository --title Weekly chaos suite failing --label ci-failure --body ${runLink}\n\nWhat failed.`,
    );

    expect(run('open').output).toContain('Commented on existing ci-failure issue #7.');
    expect(ghLog()).toContain(`issue comment 7 --repo owner/repository --body ${runLink}`);

    expect(run('close').output).toContain('Closed ci-failure issue #7.');
    expect(ghLog()).toContain(
      `issue close 7 --repo owner/repository --comment Green again. ${runLink}`,
    );

    expect(run('close').output).toContain('No open ci-failure issue to close.');
    expect(ghLog().match(/^issue create /gm)).toHaveLength(1);
  });

  it('adds the fix plan below the body: the failed step, its log tail, area and skill', () => {
    const fixtures = join(directory, 'fixtures');
    mkdirSync(fixtures);
    writeFileSync(
      join(fixtures, 'jobs.json'),
      JSON.stringify({
        jobs: [
          {
            id: 9,
            name: 'Unit tests',
            conclusion: 'failure',
            steps: [{ name: 'Run unit tests', conclusion: 'failure' }],
          },
          { id: 10, name: 'Notify failure', conclusion: null, steps: [] },
        ],
      }),
    );
    writeFileSync(
      join(fixtures, 'job.log'),
      [
        '2026-10-18T01:00:00.0000000Z ##[group]Run pnpm test:unit',
        '2026-10-18T01:00:01.0000000Z  FAIL  src/domains/billing/sub-domains/billing-plan/billing-plan.unit.test.ts',
        '2026-10-18T01:00:01.1000000Z AssertionError: expected 400 to be 200',
        '2026-10-18T01:00:02.0000000Z ##[error]Process completed with exit code 1.',
        '2026-10-18T01:00:03.0000000Z Post job cleanup.',
      ].join('\n'),
    );
    writeFileSync(
      join(fixtures, 'routes.json'),
      JSON.stringify({ routes: [{ globs: ['src/domains/**'], skills: ['be-test-generator'] }] }),
    );
    const result = run('open', { GH_FIXTURES: fixtures, RUN_ID: '42', HEAD_SHA: 'abc123' });
    expect(result.status).toBe(0);
    const body = ghLog();
    expect(body).toContain(`--body ${runLink}\n\nWhat failed.\n\n## Fix plan`);
    expect(body).toContain('### Unit tests › Run unit tests');
    expect(body).toContain('- **Owning area:** `src/domains/billing/sub-domains/billing-plan`');
    expect(body).toContain('- **Skill that fixes it:** `be-test-generator`');
    expect(body).toContain('AssertionError: expected 400 to be 200');
    expect(body).not.toContain('Post job cleanup.');
    expect(body).not.toContain('### Notify failure');
    expect(body).toContain(
      'api repos/owner/repository/contents/agent-os/hooks/skill-routing.json?ref=abc123',
    );
  });

  it('opens the issue without a plan when the plan cannot be built', () => {
    const result = run('open', { RUN_ID: '42', HEAD_SHA: 'abc123' });
    expect(result.status).toBe(0);
    expect(ghLog()).toContain(`--body ${runLink}\n\nWhat failed.\n`);
    expect(ghLog()).not.toContain('## Fix plan');
  });

  it('refuses an unknown mode', () => {
    const result = run('reopen');
    expect(result.status).toBe(2);
    expect(result.output).toContain("mode must be open or close, got 'reopen'");
  });

  it('passes bash -n', () => {
    expect(() => execFileSync('bash', ['-n', SCRIPT])).not.toThrow();
  });

  it.each(alertedWorkflows)('%s opens and closes its issue through the shared action', (name) => {
    const text = workflowText(name);
    const opened = titles(text, 'open');
    expect(opened.length).toBeGreaterThan(0);
    // Every issue a red run opens has a green run that closes it, under the same title.
    expect(new Set(titles(text, 'close'))).toEqual(new Set(opened));
  });

  it('every job that runs the action can write issues and checks the action out', () => {
    const offenders: string[] = [];
    for (const name of workflowFiles) {
      for (const [job, block] of jobBlocks(workflowText(name))) {
        if (!block.includes(ACTION_USE)) continue;
        const checkout = block.indexOf('sparse-checkout: .github/actions/ci-failure-issue');
        if (
          !block.includes('issues: write') ||
          checkout < 0 ||
          checkout > block.indexOf(ACTION_USE)
        ) {
          offenders.push(`${name} → ${job}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every job that opens an issue can read the run it reports, for the fix plan', () => {
    const offenders: string[] = [];
    for (const name of workflowFiles) {
      for (const [job, block] of jobBlocks(workflowText(name))) {
        const opensIssue = block.includes(ACTION_USE) && block.includes('mode: open');
        if (opensIssue && !/^ {6}actions: read\b/m.test(block)) offenders.push(`${name} → ${job}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // A job past its timeout-minutes ends `cancelled`, not `failure`: an alert that only asked
  // for `failure` stayed silent while the RLS parity canary timed out four nights running.
  it('every job that opens an issue also fires when a job it checks timed out', () => {
    const offenders: string[] = [];
    for (const name of workflowFiles) {
      for (const [job, block] of jobBlocks(workflowText(name))) {
        const opensIssue = block.includes(ACTION_USE) && block.includes('mode: open');
        if (!opensIssue) continue;
        const condition = block.match(/^ {4}if: (.+)$/m)?.[1] ?? '';
        const onFailure =
          condition.includes("contains(needs.*.result, 'failure')") ||
          condition.startsWith('failure()');
        const onTimeout = condition.includes("contains(needs.*.result, 'cancelled')");
        if (!(onFailure && onTimeout)) offenders.push(`${name} → ${job}: ${condition}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no workflow inlines its own ci-failure issue logic', () => {
    const inlined = workflowFiles.filter((name) => /--label ci-failure/.test(workflowText(name)));
    expect(inlined).toEqual([]);
  });
});
