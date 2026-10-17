/**
 * The merge-time freeze check behind `pnpm iteration:freeze-check` (PR CI's Iteration freeze lane).
 *
 * Every iteration a branch changes merges `frozen`, and a merged frozen iteration is never edited —
 * a correction is a new `fix` iteration. The one change a merged frozen iteration may take is
 * `pnpm iteration:intake <iteration> --compact`: stored copies removed from its `intake-files/`,
 * its resolved Intake hash unchanged. The rules: iterations/README.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  INTAKE_DIRECTORY,
  ITERATIONS_DIRECTORY,
  parseIterationName,
  parseIterationReadme,
  resolvedIntakeHash,
  resolveIntakeSnapshot,
  tryGit,
} from './iteration.util.js';

/** The Status every iteration a branch changes has when it merges. */
export const MERGE_STATUS = 'frozen';

/** How many changed paths a problem line names before it shortens to `…`. */
const NAMED_PATHS = 3;

/** One changed path of the branch: git's name-status letter (`A`, `M`, `D`, …) and the path. */
export interface ChangedPath {
  readonly status: string;
  readonly path: string;
}

/** The outcome of the freeze check. */
export interface FreezeCheck {
  /** The iterations the branch changes, sorted. */
  readonly touched: readonly string[];
  /** One line per problem, each naming its fix; empty when the branch may merge. */
  readonly problems: readonly string[];
}

/** The iteration a path belongs to (`iterations/<iteration>/…`), or undefined for any other path. */
export function iterationOfPath(path: string): string | undefined {
  const [directory, name, ...rest] = path.split('/');
  if (directory !== ITERATIONS_DIRECTORY || name === undefined || rest.length === 0) {
    return undefined;
  }
  return parseIterationName(name) === undefined ? undefined : name;
}

/** The changed paths grouped by the iteration they belong to; other paths are left out. */
export function changesByIteration(changes: readonly ChangedPath[]): Map<string, ChangedPath[]> {
  const grouped = new Map<string, ChangedPath[]>();
  for (const change of changes) {
    const iteration = iterationOfPath(change.path);
    if (iteration === undefined) continue;
    grouped.set(iteration, [...(grouped.get(iteration) ?? []), change]);
  }
  return grouped;
}

/** Whether a merged iteration's changes are a `--compact`: removals in `intake-files/`, hash kept. */
function isCompaction(options: {
  readonly repositoryRoot: string;
  readonly iteration: string;
  readonly changes: readonly ChangedPath[];
  readonly recordedHash: string | undefined;
}): boolean {
  const { repositoryRoot, iteration } = options;
  const intakePrefix = `${ITERATIONS_DIRECTORY}/${iteration}/${INTAKE_DIRECTORY}/`;
  const removalsOnly = options.changes.every(
    (change) => change.status === 'D' && change.path.startsWith(intakePrefix),
  );
  if (!removalsOnly) return false;
  if (resolveIntakeSnapshot({ repositoryRoot, iteration }).problem !== undefined) return false;
  return resolvedIntakeHash({ repositoryRoot, iteration }) === options.recordedHash;
}

/**
 * Judges one iteration the branch changes: its problems, none when it may merge.
 *
 * @remarks
 * `baseStatus` is its Status on the merge base, undefined when it is new on this branch. A merged
 * frozen iteration takes only a `--compact`; any other iteration must be `frozen` now.
 */
export function judgeIteration(options: {
  readonly repositoryRoot: string;
  readonly iteration: string;
  readonly changes: readonly ChangedPath[];
  readonly baseStatus: string | undefined;
}): string[] {
  const { repositoryRoot, iteration, changes, baseStatus } = options;
  const readmePath = join(repositoryRoot, ITERATIONS_DIRECTORY, iteration, 'README.md');
  if (!existsSync(readmePath)) {
    return [
      baseStatus === undefined
        ? `${iteration}: files without a README — open the iteration with pnpm iteration:new, or move the files out of ${ITERATIONS_DIRECTORY}/.`
        : `${iteration}: removed — a merged iteration is never removed; a correction is a new fix iteration (pnpm iteration:new fix <topic>).`,
    ];
  }
  const fields = parseIterationReadme(readFileSync(readmePath, 'utf-8'));
  if (baseStatus === MERGE_STATUS) {
    if (
      isCompaction({ repositoryRoot, iteration, changes, recordedHash: fields.get('Intake hash') })
    ) {
      return [];
    }
    const named = changes.slice(0, NAMED_PATHS).map((change) => change.path);
    const more = changes.length > NAMED_PATHS ? ', …' : '';
    return [
      `${iteration}: merged frozen, and this branch changes it (${named.join(', ')}${more}) — never edit a merged iteration; a correction is a new fix iteration (pnpm iteration:new fix <topic>). The one change it may take is pnpm iteration:intake ${iteration} --compact.`,
    ];
  }
  const status = fields.get('Status') ?? '—';
  if (status === MERGE_STATUS) return [];
  const freeze = `pnpm iteration:status ${iteration} ${MERGE_STATUS}`;
  const next = status === 'done' ? freeze : `finish it (Status done), then ${freeze}`;
  return [
    `${iteration}: Status ${status} — an iteration merges ${MERGE_STATUS}: ${next}, in the branch's last commit.`,
  ];
}

/** An iteration's Status on `revision`, undefined when it has no README there. */
function statusAt(options: {
  readonly repositoryRoot: string;
  readonly revision: string;
  readonly iteration: string;
}): string | undefined {
  const readme = tryGit({
    repositoryRoot: options.repositoryRoot,
    gitArguments: [
      'show',
      `${options.revision}:${ITERATIONS_DIRECTORY}/${options.iteration}/README.md`,
    ],
  });
  return readme === undefined ? undefined : (parseIterationReadme(readme).get('Status') ?? '—');
}

/**
 * Runs the freeze check for the commits on HEAD since its merge base with `base`.
 *
 * @remarks
 * Reads committed changes only (what a pull request merges). Failure modes: never throws — when
 * git cannot name the changes (an unknown or unfetched `base`) it fails closed with one problem.
 */
export function checkIterationFreeze(options: {
  readonly repositoryRoot: string;
  readonly base: string;
}): FreezeCheck {
  const { repositoryRoot, base } = options;
  const mergeBase = tryGit({ repositoryRoot, gitArguments: ['merge-base', 'HEAD', base] });
  const listing =
    mergeBase === undefined
      ? undefined
      : tryGit({
          repositoryRoot,
          gitArguments: [
            'diff',
            '--name-status',
            '--no-renames',
            mergeBase,
            'HEAD',
            '--',
            `${ITERATIONS_DIRECTORY}/`,
          ],
        });
  if (mergeBase === undefined || listing === undefined) {
    return {
      touched: [],
      problems: [
        `git cannot name the changes since ${base} — fetch it (git fetch origin) or pass --base <ref>.`,
      ],
    };
  }
  const changes = listing
    .split('\n')
    .filter(Boolean)
    .map((line): ChangedPath => {
      const [status = '', ...path] = line.split('\t');
      return { status, path: path.join('\t') };
    });
  const grouped = changesByIteration(changes);
  const problems = [...grouped].flatMap(([iteration, iterationChanges]) =>
    judgeIteration({
      repositoryRoot,
      iteration,
      changes: iterationChanges,
      baseStatus: statusAt({ repositoryRoot, revision: mergeBase, iteration }),
    }),
  );
  return { touched: [...grouped.keys()].sort(), problems };
}
