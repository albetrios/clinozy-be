#!/usr/bin/env node
// The fix plan of a ci-failure issue (action.yml, `open` mode): for the failed run, each failed
// job and step with the tail of its log up to the last error, the area the paths in that tail
// point at (the backend: `src/domains/<domain>/sub-domains/<sub-domain>`; the frontend: the page
// under `src/pages/`), and the skills that fix those files — read from the calling repository's
// own `agent-os/hooks/skill-routing.json` at the run's commit, the map its edit hooks use. Prints
// Markdown on stdout; prints nothing and exits 0 on any error, so an issue is always opened.
//
// Needs `gh` and a token with `actions: read` (the jobs and their logs) and `contents: read` (the
// routing map); env: GH_REPOSITORY, RUN_ID, HEAD_SHA. It reads the REST job endpoints, not
// `gh run view --log`, which refuses a run still in progress — the notify job is part of the run.
// Plain Node with no dependency: the notify jobs run on the runner's own Node, without setup-node.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

/** Log lines kept per failed job. */
export const LOG_TAIL_LINES = 40;
/** Failed jobs a plan lists. */
const MAXIMUM_JOBS = 5;
const FAILED = new Set(['failure', 'timed_out', 'cancelled', 'startup_failure']);
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/;
const SOURCE_PATH =
  /(?:^|[\s(/'"`:])((?:src|tooling|migrations|tests|plugins|docs|agent-os)\/[\w$@./-]*\.[a-z]+)/g;

/**
 * The failed jobs of `GET /repos/{repository}/actions/runs/{run}/jobs`, each with its failed step
 * names. A job still running (the notify job itself) has no conclusion and is left out.
 *
 * @param {{ jobs?: { id: number, name: string, conclusion: string | null, steps?: { name: string, conclusion: string | null }[] }[] }} run
 * @returns {{ id: number, name: string, steps: string[] }[]}
 */
export function failedJobs(run) {
  return (run.jobs ?? [])
    .filter((job) => FAILED.has(job.conclusion ?? ''))
    .map((job) => ({
      id: job.id,
      name: job.name,
      steps: (job.steps ?? [])
        .filter((step) => FAILED.has(step.conclusion ?? ''))
        .map((step) => step.name),
    }));
}

/**
 * The last `lines` lines of a job log up to its last `##[error]` line, without timestamps, color
 * codes or `##[endgroup]` markers. The steps after a failure (checkout's post-job cleanup) add
 * nothing, so the tail ends at the error; a log with no error line keeps its end.
 *
 * @param {string} text
 * @param {number} [lines]
 * @returns {string[]}
 */
export function logTail(text, lines = LOG_TAIL_LINES) {
  const kept = stripVTControlCharacters(text)
    .split('\n')
    .map((line) => line.replace(TIMESTAMP, '').trimEnd())
    .filter((line) => line.trim() !== '' && line !== '##[endgroup]');
  const lastError = kept.findLastIndex((line) => line.startsWith('##[error]'));
  return (lastError === -1 ? kept : kept.slice(0, lastError + 1)).slice(-lines);
}

/**
 * The repository paths a log names, workspace prefixes removed, most named first.
 *
 * @param {readonly string[]} lines
 * @returns {string[]}
 */
export function namedPaths(lines) {
  const counts = new Map();
  for (const line of lines)
    for (const match of line.matchAll(SOURCE_PATH)) {
      const path = match[1].replace(/[.:]+$/, '');
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([path]) => path);
}

/**
 * The area a path belongs to: a backend sub-domain (or domain), a frontend page folder, or the
 * top two folders.
 *
 * @param {string} path
 * @returns {string}
 */
export function owningArea(path) {
  const domain = /^src\/domains\/[^/]+(?:\/sub-domains\/[^/]+)?/.exec(path);
  if (domain) return domain[0];
  if (path.startsWith('src/pages/')) return path.slice(0, path.lastIndexOf('/'));
  const parts = path.split('/');
  return parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

/**
 * A glob (`*`, `**`, `?`) as a regular expression over a whole repository path.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let pattern = '';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*' && glob[index + 1] === '*') {
      const directory = glob[index + 2] === '/';
      pattern += directory ? '(?:.*/)?' : '.*';
      index += directory ? 2 : 1;
    } else if (character === '*') pattern += '[^/]*';
    else if (character === '?') pattern += '[^/]';
    else pattern += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}

/**
 * The skills the routing map names for the paths, in route order, without repeats.
 *
 * @param {{ paths: readonly string[], routes: readonly { globs?: string[], skills?: string[] }[] }} options
 * @returns {string[]}
 */
export function skillsFor({ paths, routes }) {
  const skills = [];
  for (const route of routes) {
    const globs = (route.globs ?? []).map(globToRegExp);
    if (!paths.some((path) => globs.some((glob) => glob.test(path)))) continue;
    for (const skill of route.skills ?? []) if (!skills.includes(skill)) skills.push(skill);
  }
  return skills;
}

/**
 * The fix plan as Markdown: per failed job, its failed steps, owning area, the skills that fix
 * the named files and the log tail; then which CI investigator to start.
 *
 * @param {{ repository: string, jobs: { name: string, steps: string[], tail: string[] }[], routes: readonly { globs?: string[], skills?: string[] }[] }} options
 * @returns {string}
 */
export function renderFixPlan({ repository, jobs, routes }) {
  if (jobs.length === 0) return '';
  const investigator = repository.endsWith('-fe') ? 'fe-ci-investigator' : 'be-ci-investigator';
  const lines = ['## Fix plan', ''];
  for (const job of jobs.slice(0, MAXIMUM_JOBS)) {
    const paths = namedPaths(job.tail);
    const areas = [...new Set(paths.map(owningArea))].slice(0, 3);
    const skills = skillsFor({ paths, routes });
    const steps = job.steps.length > 0 ? ` › ${job.steps.join(', ')}` : '';
    const area =
      areas.length > 0 ? areas.map((name) => `\`${name}\``).join(', ') : 'not named in the log';
    const fixers =
      skills.length > 0
        ? skills.map((skill) => `\`${skill}\``).join(' → ')
        : `none matched — start \`${investigator}\` on this job`;
    lines.push(`### ${job.name}${steps}`, '');
    lines.push(`- **Owning area:** ${area}`, `- **Skill that fixes it:** ${fixers}`);
    if (job.tail.length > 0)
      lines.push('', '```text', ...job.tail.map((line) => line.replaceAll('```', "'''")), '```');
    lines.push('');
  }
  if (jobs.length > MAXIMUM_JOBS) lines.push(`…and ${jobs.length - MAXIMUM_JOBS} more failed job(s).`, '');
  lines.push(`Diagnose with \`${investigator}\` (one per failing job) before changing anything.`);
  return `${lines.join('\n')}\n`;
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function main() {
  const { GH_REPOSITORY: repository, RUN_ID: runId, HEAD_SHA: headSha } = process.env;
  if (!repository || !runId) return;
  const run = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${runId}/jobs?per_page=100`]));
  const jobs = failedJobs(run).map((job) => {
    let tail = [];
    try {
      tail = logTail(gh(['api', `repos/${repository}/actions/jobs/${job.id}/logs`]));
    } catch {
      /* no log yet, or no actions: read — the plan names the job anyway */
    }
    return { ...job, tail };
  });
  let routes = [];
  try {
    const reference = headSha ? `?ref=${headSha}` : '';
    const map = gh([
      'api',
      `repos/${repository}/contents/agent-os/hooks/skill-routing.json${reference}`,
      '-H',
      'Accept: application/vnd.github.raw',
    ]);
    routes = JSON.parse(map).routes ?? [];
  } catch {
    /* no routing map: the plan points at the CI investigator */
  }
  process.stdout.write(renderFixPlan({ repository, jobs, routes }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch {
    /* fail-open: the issue is opened without a plan */
  }
}
