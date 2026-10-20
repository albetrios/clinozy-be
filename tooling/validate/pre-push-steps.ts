/**
 * The one pre-push step list: what `git push` runs for the commits it pushes, each with why it runs
 * or not — run by `pnpm guard:pre-push` (`tooling/validate/run-pre-push.ts`, the whole of
 * `.husky/pre-push`) and previewed by `pnpm test:affected` (`tooling/vitest/affected.ts`).
 *
 * @remarks
 * Each step is a pnpm command; the branch-name policy runs in-process first. The SonarQube gate
 * runs here, at push, as in clinozy-fe — not at every commit.
 */
import { pushSemgrepTargets } from '@/scripts/tooling/run-push-semgrep.js';

/** One pre-push step: what it runs, and whether the pushed files make it run. */
export interface PrePushStep {
  /** The command as a person would type it (`pnpm typecheck`), or `branch-name policy`. */
  label: string;
  /** The pnpm arguments it runs; empty for the in-process branch-name policy. */
  pnpmArguments: readonly string[];
  runs: boolean;
  why: string;
}

/**
 * The pushed files that make pre-push run the selected tests (`pnpm test:pre-push`): source and
 * tests, tooling, the workflows, the agent hooks, and the dependency and Vitest config. `.github/`
 * counts because the CI policy tests (`src/tests/unit/ci`) read the workflows and actions, so a
 * push that changes only a workflow runs the ones that name it; `agent-os/` counts because the
 * hook tests (`src/tests/unit/tooling`) spawn the hooks, so a hooks-only push runs them; a changed
 * test selects itself. The same rule as
 * clinozy-fe's `tooling/ci/affected.mjs`, on this repository's paths (its tests live under `src/`).
 */
export const UNIT_RELEVANT =
  /^(src\/|tooling\/|\.github\/|agent-os\/|vitest\.config\.ts$|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$)/;

/**
 * The files that make pre-push run `pnpm agent-os:generate:check`: the agent-os sources it
 * generates from and its generator. It ran only in CI until the planted-bug drill (20 Oct 2026)
 * showed a hook timeout edited in `agent-os/hooks/hooks.json` reach the PR with the generated
 * platform settings left behind.
 */
export const AGENT_OS_GENERATED_RELEVANT = /^(agent-os\/|tooling\/agent-os\/)/;

/**
 * The files that make pre-push run the generated-doc drift checks: source, tooling, and a hand
 * edit of a generated doc.
 */
export const GENERATED_DOC_RELEVANT =
  /^(src\/|tooling\/|docs\/routes\.txt$|docs\/reference\/architecture\/src-structure-tree\.txt$)/;

/**
 * Whether a pushed file makes pre-push run its e2e and integration tests as the application role
 * (`pnpm test:rls-role:changed`): TypeScript under `src/domains/` that is not a unit test — the
 * code those tests reach through the pool, and the tests themselves.
 *
 * @remarks
 * A unit test (`__tests__/unit/`, `*.unit.test.ts`) never opens the pool, so it is left out. Code
 * outside `src/domains/` (`src/shared/`, `src/infrastructure/`, migrations) reaches every test;
 * CI's four RLS application-role shards run those whole. Failure modes: none.
 */
export function isApplicationRoleRelevant(file: string): boolean {
  return (
    /^src\/domains\/.+\.ts$/.test(file) && !/(\/__tests__\/unit\/|\.unit\.test\.ts$)/.test(file)
  );
}

/**
 * Whether the files include deployed-surface runtime code that SonarQube analyzes.
 *
 * @remarks
 * `src/**\/*.ts` excluding tests (`__tests__/`, `*.test.ts`, `*.spec.ts`, `src/tests/`) and
 * `src/scripts/`. Mirrors the scoping in `sonar-project.properties`.
 */
export function shouldRunSonarScan(files: readonly string[]): boolean {
  return files.some(
    (file) =>
      /^src\/.*\.ts$/.test(file) &&
      !/(__tests__\/|\.test\.ts$|\.spec\.ts$|^src\/tests\/|^src\/scripts\/)/.test(file),
  );
}

/** The conventional-commit types a working branch may start with (`<type>/<description>`). */
export const BRANCH_TYPES = [
  'feat',
  'feature',
  'fix',
  'hotfix',
  'refactor',
  'docs',
  'test',
  'chore',
  'ci',
  'perf',
  'build',
  'style',
  'revert',
] as const;

/**
 * Why `branch` breaks the branch-naming policy, or `''`.
 *
 * @remarks
 * Working branches are `<type>/<short-description>`; the trunk is the only long-lived branch;
 * Claude Code web session branches (`claude/*`) are allowed (the cloud git proxy pins a session
 * to its own). A detached HEAD and the trunk itself are not checked. Failure modes: none.
 */
export function branchNameProblem(options: {
  readonly branch: string;
  readonly trunk: string;
}): string {
  const { branch, trunk } = options;
  if (branch === 'HEAD' || branch === trunk) return '';
  const pattern = new RegExp(`^(claude/.+|(${BRANCH_TYPES.join('|')})/.+)$`);
  if (pattern.test(branch)) return '';
  return [
    `✗ Branch "${branch}" does not follow the naming policy.`,
    '  Use <type>/<short-description>, e.g. feature/ai-stream-response or fix/login-error.',
    `  Allowed types: ${BRANCH_TYPES.join('|')}`,
    `  Long-lived: ${trunk} (only).  Hotfixes: fix/* or hotfix/* → ${trunk}.  AI web sessions: claude/*.`,
    '  See docs/process/trunk-based-workflow.md.  Bypass once: SKIP_BRANCH_CHECK=1 git push',
  ].join('\n');
}

/**
 * The steps `git push` runs for `changedFiles` (everything since `base`), in order.
 *
 * @remarks
 * Steps that take the push base get `--base <base>`, so each measures the same diff. Failure
 * modes: none — a pure function of its inputs.
 */
export function prePushSteps(options: {
  readonly changedFiles: readonly string[];
  readonly base: string;
}): PrePushStep[] {
  const { changedFiles, base } = options;
  const markdown = changedFiles.some((file) => file.endsWith('.md'));
  const generatedDocRelevant = changedFiles.some((file) => GENERATED_DOC_RELEVANT.test(file));
  const semgrep = pushSemgrepTargets(changedFiles);
  const agentOsGenerated = changedFiles.some((file) => AGENT_OS_GENERATED_RELEVANT.test(file));
  const unitRelevant = changedFiles.some((file) => UNIT_RELEVANT.test(file));
  const sonar = shouldRunSonarScan(changedFiles);
  const applicationRole = changedFiles.some(isApplicationRoleRelevant);
  /** A pnpm script step; `withBase` passes the push base, so every step measures the same diff. */
  const pnpm = (step: {
    readonly script: string;
    readonly withBase?: boolean;
    readonly runs: boolean;
    readonly why: string;
  }): PrePushStep => ({
    label: `pnpm ${step.script}`,
    pnpmArguments: [step.script, ...(step.withBase ? ['--base', base] : [])],
    runs: step.runs,
    why: step.why,
  });
  const always = (script: string) => pnpm({ script, runs: true, why: 'always' });
  return [
    { label: 'branch-name policy', pnpmArguments: [], runs: true, why: 'always' },
    always('typecheck'),
    always('build'),
    always('build:check'),
    pnpm({
      script: 'docs:lint:changed',
      withBase: true,
      runs: markdown,
      why: markdown ? 'pushed Markdown' : 'no Markdown pushed',
    }),
    ...[
      'tool:project-structure-tree:check',
      'routes:catalog:check',
      'validate:route-organization-scope',
    ].map((script) =>
      pnpm({
        script,
        runs: generatedDocRelevant,
        why: generatedDocRelevant
          ? 'pushed src/, tooling/ or a generated doc'
          : 'no src/, tooling/ or generated doc pushed',
      }),
    ),
    pnpm({
      script: 'agent-os:generate:check',
      runs: agentOsGenerated,
      why: agentOsGenerated
        ? 'pushed agent-os/ or its generator — the generated platform files must match'
        : 'no agent-os/ change pushed',
    }),
    pnpm({
      script: 'security:semgrep:push',
      withBase: true,
      runs: semgrep.length > 0,
      why:
        semgrep.length > 0
          ? `${semgrep.length} code file(s) under src/ or tooling/`
          : 'no code file under src/ or tooling/',
    }),
    pnpm({
      script: 'test:pre-push',
      withBase: true,
      runs: unitRelevant,
      why: unitRelevant
        ? 'pushed unit-relevant files — the unit-project files pnpm test:select picks (all of them when the selection escalates)'
        : 'nothing unit-relevant pushed',
    }),
    pnpm({
      script: 'test:rls-role:changed',
      withBase: true,
      runs: applicationRole,
      why: applicationRole
        ? 'pushed code or e2e/integration tests under src/domains/ — their e2e and integration tests, as the application role (clinozy_be_app, subject to RLS)'
        : 'nothing under src/domains/ beyond unit tests pushed',
    }),
    pnpm({
      script: 'sonar:scan',
      runs: sonar,
      why: sonar
        ? 'pushed deployed-surface code — any unresolved SonarQube issue blocks (no bypass)'
        : 'no deployed-surface code pushed',
    }),
  ];
}
