/**
 * Design-iteration tooling — the merge-time freeze check, `pnpm iteration:freeze-check`
 * (`tooling/iterations/iteration-freeze.util.ts`, PR CI's Iteration freeze lane).
 *
 * Pins the rule: every iteration a branch changes merges frozen; a merged frozen iteration is
 * never edited, except by a `--compact` that keeps its resolved Intake hash; paths outside an
 * iteration folder are not judged; and the check fails closed when git cannot name the changes.
 */
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addTestIteration,
  createIterationRepository,
  ITERATION_TEST_BASE_BRANCH,
  removeIterationRepositories,
  runTestGit,
} from '@/tests/helpers/iteration-repository.helper.js';
import {
  changesByIteration,
  checkIterationFreeze,
  iterationOfPath,
} from '@tooling/iterations/iteration-freeze.util.js';

const LAUNCH = 'launch-2026-09-30-jxmr';
const FEATURE = 'feat-returns-2026-10-06-kqzx';
const PRD = '# PRD\n';
const SCHEMA_ROUTES = '# schema-routes\n\n## Entity: Patient\n';

afterEach(() => {
  removeIterationRepositories();
});

function commit(repositoryRoot: string, message: string): void {
  runTestGit({ repositoryRoot, gitArguments: ['add', '-A'] });
  runTestGit({ repositoryRoot, gitArguments: ['commit', '-q', '-m', message] });
}

/** A repository whose default branch holds a merged, frozen launch; HEAD is a fresh branch. */
function repositoryWithMergedLaunch(): string {
  const repositoryRoot = createIterationRepository();
  addTestIteration({
    repositoryRoot,
    name: LAUNCH,
    fields: { status: 'frozen', dropPlaced: '2026-10-01' },
    intake: { 'PRD.md': PRD, 'schema-routes.md': SCHEMA_ROUTES },
    recordIntake: true,
  });
  commit(repositoryRoot, 'launch');
  runTestGit({ repositoryRoot, gitArguments: ['switch', '-q', '-c', 'feat/returns'] });
  return repositoryRoot;
}

function check(repositoryRoot: string) {
  return checkIterationFreeze({ repositoryRoot, base: ITERATION_TEST_BASE_BRANCH });
}

describe('iteration freeze — paths', () => {
  it('judges only paths inside an iteration folder', () => {
    expect(iterationOfPath(`iterations/${LAUNCH}/README.md`)).toBe(LAUNCH);
    expect(iterationOfPath(`iterations/${FEATURE}/intake-files/PRD.md`)).toBe(FEATURE);
    expect(iterationOfPath('iterations/README.md')).toBeUndefined();
    expect(iterationOfPath('iterations/templates/README.md')).toBeUndefined();
    expect(iterationOfPath(`docs/${LAUNCH}/README.md`)).toBeUndefined();
    const grouped = changesByIteration([
      { status: 'M', path: `iterations/${LAUNCH}/README.md` },
      { status: 'A', path: `iterations/${FEATURE}/README.md` },
      { status: 'A', path: `iterations/${FEATURE}/KICKOFF.md` },
      { status: 'M', path: 'iterations/CLAUDE.md' },
    ]);
    expect([...grouped.keys()]).toEqual([LAUNCH, FEATURE]);
    expect(grouped.get(FEATURE)).toHaveLength(2);
  });
});

describe('iteration freeze — the branch', () => {
  it('passes a branch that changes no iteration folder', () => {
    const repositoryRoot = repositoryWithMergedLaunch();
    writeFileSync(join(repositoryRoot, 'iterations', 'README.md'), '# Iterations\n');
    commit(repositoryRoot, 'rules');
    expect(check(repositoryRoot)).toEqual({ touched: [], problems: [] });
  });

  it('refuses a new iteration until it is frozen, then passes it', () => {
    const repositoryRoot = repositoryWithMergedLaunch();
    addTestIteration({
      repositoryRoot,
      name: FEATURE,
      fields: { type: 'feat', topic: 'returns', status: 'implementing' },
    });
    commit(repositoryRoot, 'feature');
    const implementing = check(repositoryRoot);
    expect(implementing.touched).toEqual([FEATURE]);
    expect(implementing.problems).toEqual([
      `${FEATURE}: Status implementing — an iteration merges frozen: finish it (Status done), then pnpm iteration:status ${FEATURE} frozen, in the branch's last commit.`,
    ]);

    addTestIteration({
      repositoryRoot,
      name: FEATURE,
      fields: { type: 'feat', topic: 'returns', status: 'done' },
    });
    commit(repositoryRoot, 'done');
    expect(check(repositoryRoot).problems[0]).toContain(
      `Status done — an iteration merges frozen: pnpm iteration:status ${FEATURE} frozen,`,
    );

    addTestIteration({
      repositoryRoot,
      name: FEATURE,
      fields: { type: 'feat', topic: 'returns', status: 'frozen' },
    });
    commit(repositoryRoot, 'frozen');
    expect(check(repositoryRoot)).toEqual({ touched: [FEATURE], problems: [] });
  });

  it('refuses any edit to a merged frozen iteration, and its removal', () => {
    const edited = repositoryWithMergedLaunch();
    writeFileSync(join(edited, 'iterations', LAUNCH, 'AS-BUILT.md'), '# AS-BUILT\n');
    commit(edited, 'edit the launch');
    const editProblems = check(edited).problems;
    expect(editProblems).toHaveLength(1);
    expect(editProblems[0]).toContain(`${LAUNCH}: merged frozen, and this branch changes it`);
    expect(editProblems[0]).toContain('a correction is a new fix iteration');

    const removed = repositoryWithMergedLaunch();
    rmSync(join(removed, 'iterations', LAUNCH), { recursive: true });
    commit(removed, 'remove the launch');
    expect(check(removed).problems).toEqual([
      `${LAUNCH}: removed — a merged iteration is never removed; a correction is a new fix iteration (pnpm iteration:new fix <topic>).`,
    ]);
  });

  it('lets a merged frozen overlay take a --compact that keeps its hash, and nothing else', () => {
    const intakeOf = (repositoryRoot: string) =>
      join(repositoryRoot, 'iterations', FEATURE, 'intake-files');
    const repositoryWithStoredCopy = (): string => {
      const repositoryRoot = repositoryWithMergedLaunch();
      runTestGit({
        repositoryRoot,
        gitArguments: ['switch', '-q', ITERATION_TEST_BASE_BRANCH],
      });
      addTestIteration({
        repositoryRoot,
        name: FEATURE,
        fields: {
          type: 'feat',
          topic: 'returns',
          status: 'frozen',
          baseline: LAUNCH,
          intakeMode: 'overlay',
          intakeNote: `1 received (schema-routes.md) · 1 carried forward from ${LAUNCH}`,
        },
        // An older overlay: it stores a copy of the launch's PRD next to what it received.
        intake: { 'PRD.md': PRD, 'schema-routes.md': `${SCHEMA_ROUTES}\n## Entity: Return\n` },
        recordIntake: true,
      });
      commit(repositoryRoot, 'feature');
      runTestGit({ repositoryRoot, gitArguments: ['switch', '-q', '-c', 'chore/compact'] });
      return repositoryRoot;
    };

    const compacted = repositoryWithStoredCopy();
    rmSync(join(intakeOf(compacted), 'PRD.md'));
    commit(compacted, 'compact');
    expect(check(compacted)).toEqual({ touched: [FEATURE], problems: [] });

    const changedSnapshot = repositoryWithStoredCopy();
    rmSync(join(intakeOf(changedSnapshot), 'schema-routes.md'));
    commit(changedSnapshot, 'remove what was received');
    expect(check(changedSnapshot).problems[0]).toContain(`${FEATURE}: merged frozen`);
  });

  it('fails closed when git cannot name the changes', () => {
    const repositoryRoot = repositoryWithMergedLaunch();
    expect(checkIterationFreeze({ repositoryRoot, base: 'origin/no-such-branch' })).toEqual({
      touched: [],
      problems: [
        'git cannot name the changes since origin/no-such-branch — fetch it (git fetch origin) or pass --base <ref>.',
      ],
    });
  });
});
