/**
 * Early failure alert for PR CI: posts a failing commit status the moment any lane of this
 * workflow run fails, while every other lane keeps running and `Quality gate` still decides the
 * merge.
 *
 * GitHub starts a `needs:` job only after everything it needs has finished, so a failure in a
 * 2-minute lane stays invisible until the 20-minute matrix is done. This watcher starts with the
 * run, polls the run's own jobs, and on the first `failure` / `timed_out` posts an
 * `Early failure alert` status (red, with the lane's name and a link to it) on the PR head commit.
 * It posts nothing when every lane passes. It is not a required check.
 *
 * The alert posts once, from the attempt that started it: re-running the failed jobs never re-runs
 * the watcher, so a re-run whose lanes all pass would leave the red status on the head commit.
 * `--clear` (the `Quality gate` job's last step, reached only when every lane passed) turns that
 * stale red alert green, and posts nothing when the head commit carries no red alert.
 *
 * Environment: GITHUB_TOKEN (actions: read, statuses: write), GITHUB_REPOSITORY, GITHUB_RUN_ID,
 * HEAD_SHA, optional GITHUB_API_URL; `--clear` also reads GITHUB_RUN_ATTEMPT and GITHUB_SERVER_URL.
 * It reads the run's jobs every 15 s and gives up after 40 min.
 *
 * Usage (pr-ci.yml `early-failure-alert` job): `node tooling/ci/early-failure-alert.mjs`;
 * (pr-ci.yml `quality-gate` job): `node tooling/ci/early-failure-alert.mjs --clear`.
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { isMain, parseCommandLine } from '../setup/common/script.ts';

export const ALERT_CONTEXT = 'Early failure alert';

/** Jobs that never count as lanes: this watcher and the aggregate that waits for the lanes. */
export const NOT_LANES = new Set([ALERT_CONTEXT, 'Quality gate']);

const FAILED = new Set(['failure', 'timed_out']);
/** How often the run's jobs are read, and how long the alert waits for a lane to fail. */
const POLL_MILLISECONDS = 15_000;
const MAX_WAIT_MILLISECONDS = 40 * 60_000;

/** The first lane of the run that failed, or null. */
export function findFailedLane(jobs) {
  return jobs.find((job) => !NOT_LANES.has(job.name) && FAILED.has(job.conclusion)) ?? null;
}

/** Whether every lane has finished (the watcher can stop). */
export function lanesFinished(jobs) {
  return jobs.filter((job) => !NOT_LANES.has(job.name)).every((job) => job.status === 'completed');
}

/** The commit status the alert posts for a failed lane. */
export function alertStatus(lane) {
  return {
    state: 'failure',
    context: ALERT_CONTEXT,
    description: `${lane.name} failed; the other lanes keep running`.slice(0, 140),
    target_url: lane.html_url,
  };
}

/** Whether the head commit's alert is red (the combined status lists each context's latest). */
export function alertIsRed(statuses) {
  return statuses.some((status) => status.context === ALERT_CONTEXT && status.state === 'failure');
}

/** The commit status that turns a stale alert green once every lane of a later attempt passed. */
export function clearedStatus({ runAttempt, runUrl }) {
  return {
    state: 'success',
    context: ALERT_CONTEXT,
    description: `Cleared: every lane passed on run attempt ${runAttempt}`,
    target_url: runUrl,
  };
}

async function github({ path, method = 'GET', body }) {
  const response = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
  return response.json();
}

/** Watches the run's lanes and posts the alert on the first failure. */
async function watch() {
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const headSha = process.env.HEAD_SHA;
  const deadline = Date.now() + MAX_WAIT_MILLISECONDS;
  for (;;) {
    let jobs = [];
    try {
      ({ jobs } = await github({
        path: `/repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
      }));
    } catch (error) {
      console.log(`early-failure-alert: could not list the jobs (${error.message}); retrying`);
    }
    const lane = findFailedLane(jobs);
    if (lane) {
      await github({
        path: `/repos/${repository}/statuses/${headSha}`,
        method: 'POST',
        body: alertStatus(lane),
      });
      console.log(`early-failure-alert: "${lane.name}" failed — status posted on ${headSha}`);
      return;
    }
    if (jobs.length > 0 && lanesFinished(jobs)) {
      console.log('early-failure-alert: every lane finished without a failure');
      return;
    }
    if (Date.now() > deadline) {
      console.log('early-failure-alert: stopped watching at the time limit');
      return;
    }
    await sleep(POLL_MILLISECONDS);
  }
}

/** `--clear`: turns a red alert left by an earlier attempt green, now that every lane passed. */
async function clear() {
  const repository = process.env.GITHUB_REPOSITORY;
  const headSha = process.env.HEAD_SHA;
  const { statuses } = await github({
    path: `/repos/${repository}/commits/${headSha}/status?per_page=100`,
  });
  if (!alertIsRed(statuses)) {
    console.log('early-failure-alert: no red alert on the head commit; nothing to clear');
    return;
  }
  await github({
    path: `/repos/${repository}/statuses/${headSha}`,
    method: 'POST',
    body: clearedStatus({
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '1',
      runUrl: `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    }),
  });
  console.log(`early-failure-alert: every lane passed — the red alert on ${headSha} is cleared`);
}

if (isMain(import.meta.url)) {
  // An unknown option is a broken workflow step, not an alert that could not post: it stops here.
  const { values } = parseCommandLine({
    args: process.argv.slice(2),
    options: { clear: { type: 'boolean' } },
  });
  (values.clear ? clear() : watch()).catch((error) => {
    // An alert that cannot post or clear must not fail the run; the lanes and Quality gate gate.
    console.log(`early-failure-alert: ${error.message}`);
  });
}
