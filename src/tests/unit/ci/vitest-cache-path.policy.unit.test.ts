import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOWS = '.github/workflows';
const workflows = readdirSync(WORKFLOWS)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => [name, readFileSync(join(WORKFLOWS, name), 'utf8')] as const);

/**
 * Locks in a Vitest cache that caches something: Vitest 5 keeps each file's last duration and
 * result (what it orders a run by) in Vite's cache directory, `node_modules/.vite/vitest`.
 * `node_modules/.vitest` is the Vitest 0.x location; nothing writes it any more, so a cache
 * step pointed there saved and restored an empty directory on every run.
 */
describe('Vitest cache path', () => {
  it('no workflow caches the directory Vitest no longer writes', () => {
    const stale = workflows.filter(([, text]) => /path: node_modules\/\.vitest\b/.test(text));
    expect(stale.map(([name]) => name)).toEqual([]);
  });

  it('every Vitest cache step caches node_modules/.vite/vitest', () => {
    const steps = workflows.flatMap(([name, text]) =>
      text
        .split('\n      - name: ')
        .filter((step) => step.startsWith('Cache Vitest'))
        .map((step) => [name, step] as const),
    );
    expect(steps.length).toBeGreaterThanOrEqual(4);
    for (const [name, step] of steps) {
      expect(step, name).toContain('path: node_modules/.vite/vitest');
    }
  });
});
