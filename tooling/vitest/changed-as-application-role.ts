#!/usr/bin/env tsx
/**
 * `pnpm test:rls-role:changed [--base <ref>]` — the e2e and integration tests a push changes, run
 * as the application role (`clinozy_be_app`, subject to row-level security), as pre-push's step
 * after the unit tests.
 *
 * Every other local lane connects with a role that bypasses RLS, so a statement that reaches a
 * FORCE RLS table outside a database context passes there and returns nothing in production.
 * Pull request #125 pushed one (an organization lookup ahead of `withAppDatabaseContext`,
 * answered 404 as `clinozy_be_app`) through a green pre-push; the PR's RLS application-role lane
 * caught it 5.4 minutes into CI. CI still runs both lanes whole.
 */
import { fileURLToPath } from 'node:url';
import { changedSince, resolveBase } from '@tooling/setup/common/git-environment.js';
import { isMain, parseCommandLine } from '@tooling/setup/common/script.js';
import { isApplicationRoleRelevant } from '@tooling/validate/pre-push-steps.js';
import { runVitestAsApplicationRole } from '@tooling/vitest/run-as-application-role.js';
import {
  buildImportGraph,
  changedOnly,
  isTestFile,
  projectOf,
  selectTests,
  type TestSelection,
} from '@tooling/vitest/test-selection.util.js';

/** The Vitest projects that reach Postgres through the pool under test: the RLS lane's projects. */
export const APPLICATION_ROLE_PROJECTS = ['e2e', 'integration'];

/**
 * The core domains, whose change runs that domain's own e2e and integration tests instead of the
 * selection's: for auth and audit `pnpm test:select` selects everything, and for tenancy and user
 * it reaches far more database tests than a push can afford (21 Oct 2026: an `organization.service.ts`
 * change selects 132 e2e and integration files against tenancy's own 21, a `user-settings.service.ts`
 * change 76 against user's 12). CI's application-role shards run the rest.
 */
export const OWN_TESTS_DOMAINS = ['tenancy', 'user', 'auth', 'audit'];

/** What the step runs: the test files, and why each group was picked. */
export interface ApplicationRoleTests {
  files: string[];
  reasons: string[];
}

/**
 * The e2e and integration test files to run as the application role for `changedFiles`.
 *
 * @remarks
 * - **Algorithm:** keeps the files {@link isApplicationRoleRelevant} accepts. Code in a core domain
 *   ({@link OWN_TESTS_DOMAINS}) selects that domain's e2e and integration tests: there
 *   `pnpm test:select` selects everything or close to the two whole lanes, too long for a push.
 *   Every other file, a changed test included, goes to `pnpm test:select`'s changed-only
 *   selection (`select`), which drops the always-run tests and turns an escalation into none.
 * - **Failure modes:** none; `select` fails closed (an error selects everything, so here none,
 *   and the reason says so).
 */
export function applicationRoleTests(options: {
  readonly changedFiles: readonly string[];
  /** Every test file in the repository, for the core domains. */
  readonly testFiles: readonly string[];
  readonly select: (changedFiles: string[]) => TestSelection;
}): ApplicationRoleTests {
  const isDatabaseTest = (test: string) =>
    APPLICATION_ROLE_PROJECTS.includes(projectOf(test) ?? '');
  const escalated = new Map<string, number>();
  const selectable: string[] = [];
  for (const file of options.changedFiles.filter(isApplicationRoleRelevant)) {
    const domain = OWN_TESTS_DOMAINS.find((name) => file.startsWith(`src/domains/${name}/`));
    if (domain && !isTestFile(file)) escalated.set(domain, (escalated.get(domain) ?? 0) + 1);
    else selectable.push(file);
  }
  const files = new Set<string>();
  const reasons: string[] = [];
  for (const [domain, changed] of escalated) {
    const tests = options.testFiles.filter(
      (test) => test.startsWith(`src/domains/${domain}/`) && isDatabaseTest(test),
    );
    for (const test of tests) files.add(test);
    reasons.push(
      `${changed} changed file(s) in ${domain}, a core domain: its ${tests.length} e2e and integration test file(s)`,
    );
  }
  if (selectable.length > 0) {
    const selection = changedOnly(options.select(selectable));
    const tests = APPLICATION_ROLE_PROJECTS.flatMap((project) => selection.projects[project] ?? []);
    for (const test of tests) files.add(test);
    const detail = selection.mode === 'selected' ? '' : ` (${selection.reasons.join('; ')})`;
    reasons.push(
      `${selectable.length} changed file(s): pnpm test:select picks ${tests.length} e2e and integration test file(s)${detail}`,
    );
  }
  return { files: [...files].sort(), reasons };
}

function main(): number {
  const { values } = parseCommandLine({
    args: process.argv.slice(2),
    options: { base: { type: 'string' } },
  });
  const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
  const graph = buildImportGraph(repositoryRoot);
  const plan = applicationRoleTests({
    changedFiles: changedSince({ base: resolveBase({ base: values.base }) }),
    testFiles: graph.tests,
    select: (changedFiles) => selectTests({ changedFiles, repositoryRoot, graph }),
  });
  for (const reason of plan.reasons) console.log(`Application-role tests: ${reason}`);
  if (plan.files.length === 0) {
    console.log('Application-role tests: none selected');
    return 0;
  }
  const projects = APPLICATION_ROLE_PROJECTS.flatMap((project) => ['--project', project]);
  return runVitestAsApplicationRole([...projects, ...plan.files]);
}

if (isMain(import.meta.url)) {
  process.exitCode = main();
}
