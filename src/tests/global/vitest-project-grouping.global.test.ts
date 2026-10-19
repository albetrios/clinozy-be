import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { vitestProjects } from '@tooling/vitest/projects.js';
import { LANES } from '@tooling/vitest/lanes.js';
import { formatRunSummary } from '@tooling/vitest/run-parallel.js';

/**
 * Policy: the Vitest projects launched in ONE process that run their files in parallel and share
 * a `sequence.groupOrder` must agree on `maxWorkers`.
 *
 * Vitest refuses to start when two such projects disagree ("Projects X and Y have different
 * 'maxWorkers' but same 'sequence.groupOrder'"), and it fails as an *unhandled error* before any
 * file runs — the lane reports "no tests" rather than a failure anyone reads as a config bug.
 * Projects with `fileParallelism: false` run one at a time after the rest and are outside that
 * check, and `e2e` + `integration` take their own group order (Vitest 5.0.3, measured 19 Oct).
 *
 * This bit `pnpm test` / `pnpm test:fast`: `property` was added to the fast lane
 * without the `maxWorkers: '50%'` that `unit` and `global` carry, so the whole
 * parallel tier ran zero tests. The groupings below are derived from the real
 * launchers (package.json scripts + the parallel driver's lanes), so a new
 * project — or a new multi-project script — is covered the moment it is added.
 */

/** Projects that a single vitest process is asked to run together. */
interface ProjectGrouping {
  source: string;
  projects: string[];
}

/** Extracts `--project a --project b` sequences from a shell command / arg list. */
function projectsFromArgs(tokens: readonly string[]): string[] {
  const projects: string[] = [];
  tokens.forEach((token, index) => {
    if (token === '--project') {
      const name = tokens[index + 1];
      if (name !== undefined) projects.push(name);
    }
  });
  return projects;
}

function collectGroupings(): ProjectGrouping[] {
  const groupings: ProjectGrouping[] = [];

  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    const projects = projectsFromArgs(command.split(/\s+/));
    if (projects.length > 1) groupings.push({ source: `package.json script "${name}"`, projects });
  }

  for (const lane of LANES) {
    const projects = projectsFromArgs(lane.args);
    // A serial lane splits into one process per project, so its members never share a process.
    if (projects.length > 1 && lane.serial !== true) {
      groupings.push({ source: `run-parallel lane "${lane.name}"`, projects });
    }
  }

  return groupings;
}

/** How a project runs its files, as configured (undefined `maxWorkers` = Vitest default). */
type ProjectParallelism = { maxWorkers: unknown; parallel: boolean; groupOrder: number };

function parallelismByProject(): Map<string, ProjectParallelism> {
  const byName = new Map<string, ProjectParallelism>();
  for (const project of vitestProjects) {
    const test = (
      project as {
        test?: {
          name?: string;
          maxWorkers?: unknown;
          fileParallelism?: boolean;
          sequence?: { groupOrder?: number };
        };
      }
    ).test;
    if (test?.name === undefined) continue;
    byName.set(test.name, {
      maxWorkers: test.maxWorkers,
      parallel: test.fileParallelism !== false,
      groupOrder: test.sequence?.groupOrder ?? 0,
    });
  }
  return byName;
}

describe('Global: vitest project grouping', () => {
  const groupings = collectGroupings();
  const parallelism = parallelismByProject();

  it('finds the multi-project launchers it is meant to guard', () => {
    expect(groupings.length).toBeGreaterThan(0);
    expect(groupings.some((grouping) => grouping.projects.includes('property'))).toBe(true);
  });

  it('names only projects that exist in the vitest config', () => {
    for (const { source, projects } of groupings) {
      for (const project of projects) {
        expect(parallelism.has(project), `${source} names unknown project "${project}"`).toBe(true);
      }
    }
  });

  it('runs no two parallel projects of one group order with different maxWorkers in one process', () => {
    for (const { source, projects } of groupings) {
      const groups = new Map<number, string[]>();
      for (const project of projects) {
        const settings = parallelism.get(project);
        if (!settings?.parallel) continue;
        groups.set(settings.groupOrder, [...(groups.get(settings.groupOrder) ?? []), project]);
      }
      for (const [groupOrder, members] of groups) {
        const distinct = [
          ...new Set(members.map((project) => parallelism.get(project)?.maxWorkers)),
        ];
        expect(
          distinct.length,
          `${source} runs [${members.join(', ')}] in parallel in group order ${groupOrder} of one ` +
            `vitest process, but their maxWorkers differ (${members.map((project) => `${project}=${String(parallelism.get(project)?.maxWorkers)}`).join(', ')}). ` +
            'Vitest aborts the run before any test executes — give them the same maxWorkers.',
        ).toBe(1);
      }
    }
  });
});

describe('Global: parallel run summary', () => {
  it('reports the failing exit code on the total row, not a hardcoded 0', () => {
    // Regression: the total row hardcoded `exit=0`, so a run whose integration lane read
    // `exit=1` still printed `total (wall) … exit=0` directly beneath it. The process exit was
    // always correct, but the summary is the line a human reads first — and it said "passed".
    const summary = formatRunSummary(
      [
        { name: 'fast', code: 0, ms: 1000 },
        { name: 'db-bound:integration', code: 1, ms: 2000 },
      ],
      3000,
    );

    expect(summary).toMatch(/total \(wall\)\s+3\.0s\s+exit=1/);
  });

  it('says later lanes did not run, so a missing row is not read as a vanished lane', () => {
    // Lanes run in sequence and the runner stops at the first failure, so every lane after it
    // is simply absent from the table. Without this note the omission looks like a lost lane.
    const summary = formatRunSummary(
      [
        { name: 'fast', code: 0, ms: 1000 },
        { name: 'db-bound:integration', code: 1, ms: 2000 },
      ],
      3000,
    );

    expect(summary).toContain('Stopped after the first failing lane (db-bound:integration)');
  });

  it('keeps the total row at 0 when every lane passed', () => {
    const summary = formatRunSummary([{ name: 'fast', code: 0, ms: 1000 }], 1500);

    expect(summary).toMatch(/total \(wall\)\s+1\.5s\s+exit=0/);
    expect(summary).not.toContain('Stopped after the first failing lane');
  });
});
