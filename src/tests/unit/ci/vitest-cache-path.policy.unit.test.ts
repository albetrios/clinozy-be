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
        .filter(
          (step) => step.startsWith('Cache Vitest') || step.startsWith('Save the Vitest cache'),
        )
        .map((step) => [name, step] as const),
    );
    expect(steps.length).toBeGreaterThanOrEqual(4);
    for (const [name, step] of steps) {
      expect(step, name).toContain('path: node_modules/.vite/vitest');
    }
  });

  // One scheme, as in clinozy-fe: every run restores the newest main-branch copy; only main saves
  // (cleanup-cache.yml drops every PR-scoped cache when the PR's run ends).
  it('restores on every run and saves on main only, under one run-scoped key', () => {
    for (const [name, text] of workflows) {
      if (!text.includes('node_modules/.vite/vitest')) continue;
      expect(text, name).not.toMatch(/uses: actions\/cache@/);
      const restores = [
        ...text.matchAll(/actions\/cache\/restore@[\s\S]*?key: (vitest-[^\n]+)/g),
      ].map((match) => match[1]);
      const saves = [
        ...text.matchAll(
          /github\.ref == 'refs\/heads\/main' \}\}\n\s+uses: actions\/cache\/save@[\s\S]*?key: (vitest-[^\n]+)/g,
        ),
      ].map((match) => match[1]);
      expect(restores.length, name).toBeGreaterThan(0);
      expect(saves, name).toEqual(restores);
      for (const key of restores) expect(key, name).toMatch(/-\$\{\{ github\.run_id \}\}$/);
    }
  });
});
