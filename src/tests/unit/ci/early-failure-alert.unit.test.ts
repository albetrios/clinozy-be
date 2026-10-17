import { readFileSync } from 'node:fs';
import {
  ALERT_CONTEXT,
  alertStatus,
  findFailedLane,
  lanesFinished,
  type RunJob,
} from '@tooling/ci/early-failure-alert.mjs';
import { describe, expect, it } from 'vitest';

const prCi = readFileSync('.github/workflows/pr-ci.yml', 'utf8');

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
    const start = prCi.indexOf('\n  early-failure-alert:');
    const block = prCi.slice(start, prCi.indexOf('\n  quality-gate:'));
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('statuses: write');
    expect(block).toContain('actions: read');
    expect(block).toContain('run: node tooling/ci/early-failure-alert.mjs');
    // No `needs:`: it starts with the run instead of after a lane.
    expect(block).not.toMatch(/^ {4}needs:/m);
    const gate = prCi.slice(prCi.indexOf('\n  quality-gate:'));
    expect(gate.slice(0, gate.indexOf('if: always()'))).not.toContain('- early-failure-alert');
  });
});
