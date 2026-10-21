import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { jobBlock, jobBlocks } from '@/tests/helpers/workflow-jobs.helper.js';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard: PR CI tests one tree in every lane — the PR merged with main.
 *
 * On a `pull_request` event GitHub builds a test merge of the PR into main (`refs/pull/<n>/merge`)
 * and sets `github.sha` to it; a checkout with no `ref:` takes that commit. The DB matrix used to be
 * passed the PR head (`github.event.pull_request.head.sha`) instead, so one run tested two trees.
 * With strict up-to-date off (`.github/rulesets/main.json`), the head of a branch behind main is a
 * tree that never lands: #134's head re-ran a test-report hang that #133 had fixed on main, and its
 * Quality gate went red although the PR merged with main held the fix. And since the post-merge FAST
 * lane trusts the PR's matrix for a single-PR push, the merged tree never met the DB tests at all.
 *
 * Pinned here, for every workflow a pull request runs and every reusable workflow it calls:
 *   1. pr-ci.yml passes the DB matrix `github.sha`, never the head;
 *   2. a checkout takes the run's commit — no `ref:`, or `github.sha` — and a reusable workflow's
 *      checkout takes the commit its caller passes (`inputs.merge_commit_sha || github.sha`);
 *   3. a reusable call that passes `merge_commit_sha` passes `github.sha`.
 * The head stays readable for what is not a test: the commit status the early failure alert posts,
 * the docs lane's changed-file list. clinozy-fe pins the same in tests/ci/pr-merge-commit.policy.test.ts.
 */
const WORKFLOW_DIRECTORY = join(process.cwd(), '.github/workflows');
const MATRIX_WORKFLOW = 'reusable-vitest-postgres-redis.yml';

/** The run's own commit: on a pull request, the PR merged with main. */
const RUN_COMMIT = /^\$\{\{ github\.sha \}\}$/;
/** A reusable workflow's checkout of the commit its caller passes, else the run's own. */
const CALLER_COMMIT = /^\$\{\{ inputs\.merge_commit_sha \|\| github\.sha \}\}$/;

function readWorkflow(file: string): string {
  return readFileSync(join(WORKFLOW_DIRECTORY, file), 'utf8');
}

/** The workflow's `on:` block: from `on:` to the next top-level key. */
function triggers(workflow: string): string {
  const start = workflow.search(/^on:/m);
  if (start === -1) return '';
  const rest = workflow.slice(start + 'on:'.length);
  const end = rest.search(/^\S/m);
  return end === -1 ? rest : rest.slice(0, end);
}

/** The workflows a pull request runs directly (`pull_request:` under `on:`). */
function pullRequestWorkflows(): string[] {
  return readdirSync(WORKFLOW_DIRECTORY)
    .filter((file) => file.endsWith('.yml'))
    .filter((file) => /^ {2}pull_request:/m.test(triggers(readWorkflow(file))));
}

/** The local reusable workflow a job calls, if it calls one. */
function calledWorkflow(job: string): string | undefined {
  return /^ {4}uses: \.\/\.github\/workflows\/([A-Za-z0-9._-]+\.yml)\s*$/m.exec(job)?.[1];
}

/** Every `actions/checkout` step: from its `- ` item to the next item or a shallower line. */
function checkoutSteps(workflow: string): string[] {
  const lines = workflow.split('\n');
  return lines.flatMap((line, index) => {
    if (!/\buses: actions\/checkout@/.test(line)) return [];
    let start = index;
    while (start > 0 && !/^\s*- /.test(lines[start] ?? '')) start -= 1;
    const itemIndent = (lines[start] ?? '').indexOf('-');
    let end = start + 1;
    while (end < lines.length) {
      const next = lines[end] ?? '';
      if (next.trim() !== '' && next.search(/\S/) <= itemIndent) break;
      end += 1;
    }
    return [lines.slice(start, end).join('\n')];
  });
}

/** The `ref:` a checkout step names, or undefined for the default (the run's commit). */
function checkoutRef(step: string): string | undefined {
  return /^\s+ref:\s*(.*)$/m.exec(step)?.[1]?.trim();
}

/** A checkout of another repository (`repository:`) tests nothing of this one. */
function checksOutThisRepository(step: string): boolean {
  return !/^\s+repository:/m.test(step);
}

/** Every job of a pull-request workflow that calls a local reusable workflow. */
function reusableCalls(): Array<{ caller: string; workflow: string; job: string }> {
  return pullRequestWorkflows().flatMap((file) =>
    jobBlocks(readWorkflow(file)).flatMap(([id, job]) => {
      const workflow = calledWorkflow(job);
      return workflow ? [{ caller: `${file} job '${id}'`, workflow, job }] : [];
    }),
  );
}

describe('PR CI tests one tree: the PR merged with main', () => {
  it('finds the pull-request workflows, their checkouts and their reusable calls', () => {
    // A parser that matched nothing would let every check below pass vacuously.
    expect(pullRequestWorkflows()).toEqual(
      expect.arrayContaining(['pr-ci.yml', 'pr-migration-verify.yml']),
    );
    expect(checkoutSteps(readWorkflow('pr-ci.yml')).length).toBeGreaterThan(10);
    expect(checkoutSteps(readWorkflow(MATRIX_WORKFLOW))).toHaveLength(3);
    expect(reusableCalls().map((call) => call.workflow)).toContain(MATRIX_WORKFLOW);
  });

  it('passes the DB matrix github.sha, the PR merged with main, never the PR head', () => {
    const matrix = jobBlock({ workflow: readWorkflow('pr-ci.yml'), job: 'matrix-tests' });
    expect(calledWorkflow(matrix)).toBe(MATRIX_WORKFLOW);
    expect(matrix).toMatch(/^ {6}merge_commit_sha: \$\{\{ github\.sha \}\}$/m);
  });

  it('checks out the run commit in every job a pull request runs', () => {
    const elsewhere = pullRequestWorkflows().flatMap((file) =>
      checkoutSteps(readWorkflow(file))
        .filter(checksOutThisRepository)
        .map(checkoutRef)
        .filter((ref) => ref !== undefined && !RUN_COMMIT.test(ref))
        .map((ref) => `${file}: ref: ${ref}`),
    );
    expect(elsewhere).toEqual([]);
  });

  it('tests the commit the caller passes in every reusable workflow a pull request calls', () => {
    const drifting = reusableCalls().flatMap(({ caller, workflow, job }) => {
      const passed = /^ {6}merge_commit_sha:\s*(.*)$/m.exec(job)?.[1]?.trim();
      const passedElsewhere =
        passed === undefined || RUN_COMMIT.test(passed)
          ? []
          : [`${caller} passes merge_commit_sha: ${passed}`];
      const checkedOutElsewhere = checkoutSteps(readWorkflow(workflow))
        .filter(checksOutThisRepository)
        .map(checkoutRef)
        .filter((ref) => ref !== undefined && !RUN_COMMIT.test(ref) && !CALLER_COMMIT.test(ref))
        .map((ref) => `${workflow}: ref: ${ref}`);
      return [...passedElsewhere, ...checkedOutElsewhere];
    });
    expect(drifting).toEqual([]);
  });
});
