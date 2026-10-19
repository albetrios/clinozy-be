import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ALERT_CONTEXT,
  alertStatus,
  findFailedLane,
  lanesFinished,
  type RunJob,
} from '@tooling/ci/early-failure-alert.mjs';
import { describe, expect, it } from 'vitest';

const prCi = readFileSync('.github/workflows/pr-ci.yml', 'utf8');
const alertJob = prCi.slice(
  prCi.indexOf('\n  early-failure-alert:'),
  prCi.indexOf('\n  quality-gate:'),
);

/** `entry` and every local module it loads, following relative imports. */
function localModules(entry: string): string[] {
  const found = new Set([entry]);
  for (const file of found) {
    for (const match of readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)) {
      found.add(join(dirname(file), match[1] ?? ''));
    }
  }
  return [...found];
}

const job = (name: string, status: string, conclusion: string | null = null): RunJob => ({
  name,
  status,
  conclusion,
  html_url: `https://github.com/example/actions/jobs/${encodeURIComponent(name)}`,
});

describe('PR CI early failure alert', () => {
  it('finds the first failed or timed-out lane and ignores the watcher and the gate', () => {
    const jobs = [
      job('Lint', 'completed', 'success'),
      job(ALERT_CONTEXT, 'in_progress'),
      job('Quality gate', 'completed', 'failure'),
      job('Typecheck', 'completed', 'failure'),
      job('matrix-tests / app', 'completed', 'timed_out'),
    ];
    expect(findFailedLane(jobs)?.name).toBe('Typecheck');
    expect(findFailedLane([job('Lint', 'completed', 'cancelled')])).toBeNull();
  });

  it('stops watching once every lane has finished, whatever the watcher itself is doing', () => {
    expect(
      lanesFinished([job('Lint', 'completed', 'success'), job(ALERT_CONTEXT, 'in_progress')]),
    ).toBe(true);
    expect(
      lanesFinished([job('Lint', 'completed', 'success'), job('Typecheck', 'in_progress')]),
    ).toBe(false);
  });

  it('posts a failing status that names the lane and links to it', () => {
    const lane = job('matrix-tests / app', 'completed', 'failure');
    expect(alertStatus(lane)).toEqual({
      state: 'failure',
      context: ALERT_CONTEXT,
      description: 'matrix-tests / app failed; the other lanes keep running',
      target_url: lane.html_url,
    });
  });

  it('runs as an advisory job with the permissions it needs, outside the Quality gate', () => {
    expect(prCi.indexOf('\n  early-failure-alert:')).toBeGreaterThan(-1);
    expect(alertJob).toContain('statuses: write');
    expect(alertJob).toContain('actions: read');
    expect(alertJob).toContain('run: node tooling/ci/early-failure-alert.mjs');
    // No `needs:`: it starts with the run instead of after a lane.
    expect(alertJob).not.toMatch(/^ {4}needs:/m);
    const gate = prCi.slice(prCi.indexOf('\n  quality-gate:'));
    expect(gate.slice(0, gate.indexOf('if: always()'))).not.toContain('- early-failure-alert');
  });

  it('checks out every local module the watcher imports (the job is a sparse checkout)', () => {
    const lines = alertJob.split('\n');
    const key = lines.findIndex((line) => line.trimStart().startsWith('sparse-checkout:'));
    const keyLine = lines[key] ?? '';
    const depth = (line: string) => line.length - line.trimStart().length;
    const value = keyLine.slice(keyLine.indexOf(':') + 1).trim();
    // `sparse-checkout: <folder>`, or `sparse-checkout: |` and one folder per deeper line.
    const block = lines.slice(key + 1);
    const blockEnd = block.findIndex((line) => depth(line) <= depth(keyLine));
    const folders = value === '|' ? block.slice(0, blockEnd).map((line) => line.trim()) : [value];
    const missing = localModules('tooling/ci/early-failure-alert.mjs').filter(
      (file) => !folders.some((folder) => file.startsWith(`${folder}/`)),
    );
    expect(folders.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
