/**
 * The one list of every check that warns instead of blocking — in a workflow (a `--report-only`
 * flag, `continue-on-error`) or as a package script that reports without failing. A check is
 * warn-only only when it is listed here with the reason it does not block;
 * `src/tests/unit/ci/warn-only.policy.unit.test.ts` fails on one that is not listed, and on a listed
 * one that no longer exists.
 */

/**
 * How a check is kept from blocking.
 *
 * @remarks
 * Notes: `report-only flag` — the command is passed `--report-only` and prints its verdict without
 * failing; `continue-on-error` — the workflow step fails without failing its job; `report script` —
 * a package script whose command ends in `|| echo …`, so its own exit code never counts.
 */
export type WarnOnlyMechanism = 'report-only flag' | 'continue-on-error' | 'report script';

/**
 * One non-blocking check: a workflow or composite-action step, or a package script.
 *
 * @remarks
 * Notes: `workflow` is the file under `.github/` and `step` the step's `name:`; `script` is the
 * `package.json` script name. `reason` is one line on why it warns rather than blocks — what does
 * block instead, or why a failure there must not fail the run.
 */
export type WarnOnlyCheck =
  | {
      readonly workflow: string;
      readonly step: string;
      readonly mechanism: 'report-only flag' | 'continue-on-error';
      readonly reason: string;
    }
  | {
      readonly script: string;
      readonly mechanism: 'report-only flag' | 'report script';
      readonly reason: string;
    };

const PULL_REQUEST_CI = '.github/workflows/pr-ci.yml';
const DATABASE_TESTS = '.github/workflows/reusable-vitest-postgres-redis.yml';
const NIGHTLY_LOAD = '.github/workflows/scheduled-k6-load-slo.yml';
const UPLOAD_API_DOCS = '.github/actions/upload-api-docs/action.yml';

/** An informational k6 scenario of the nightly load run. */
const INFORMATIONAL_SCENARIO =
  'informational k6 scenario: its summary is reported; the SLO gate step and the strict journeys are what block the nightly';
/** A token refresh between the nightly's scenario blocks. */
const CREDENTIAL_REFRESH =
  'best-effort token refresh between informational blocks; a scenario left without a fresh token reports its own failure';

/**
 * Every warn-only check, by where it is declared.
 *
 * @remarks
 * Notes: add an entry in the same change that makes a check non-blocking, and remove it in the
 * change that makes the check block again — the policy test holds both directions.
 */
export const WARN_ONLY_CHECKS: readonly WarnOnlyCheck[] = [
  {
    workflow: PULL_REQUEST_CI,
    step: 'Dependency audit (all deps, advisory)',
    mechanism: 'continue-on-error',
    reason:
      'the production tree (Production dependency audit) is the blocking gate; a dev-only advisory with no published fix would otherwise wedge every PR',
  },
  {
    workflow: DATABASE_TESTS,
    step: 'Route success-status coverage gate (merged shards)',
    mechanism: 'report-only flag',
    reason:
      'capture-based and environment-inconsistent; the e2e/integration shards that produce the observations are the authoritative gate',
  },
  {
    workflow: DATABASE_TESTS,
    step: 'Merge coverage and check thresholds',
    mechanism: 'report-only flag',
    reason:
      'blocks on pull requests; post-merge and dispatch runs only report, since the PR already gated the change',
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'Gate — health stress + API stress (k6 SLO)',
    mechanism: 'continue-on-error',
    reason:
      'deferred, not dropped: the informational scenarios still run, then Enforce gate success (SLO) fails the job on this outcome',
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'Refresh load-test credentials (before the informational scenarios)',
    mechanism: 'continue-on-error',
    reason: CREDENTIAL_REFRESH,
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'k6 auth-onboarding (informational)',
    mechanism: 'continue-on-error',
    reason: INFORMATIONAL_SCENARIO,
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'k6 passwordless-signup (informational)',
    mechanism: 'continue-on-error',
    reason: INFORMATIONAL_SCENARIO,
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'k6 daily-ops (informational)',
    mechanism: 'continue-on-error',
    reason: INFORMATIONAL_SCENARIO,
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'k6 webhooks (informational)',
    mechanism: 'continue-on-error',
    reason: INFORMATIONAL_SCENARIO,
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'k6 admin (informational)',
    mechanism: 'continue-on-error',
    reason: INFORMATIONAL_SCENARIO,
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'Refresh load-test credentials (before the organization-scoped scenarios)',
    mechanism: 'continue-on-error',
    reason: CREDENTIAL_REFRESH,
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'k6 org-scoped routes (informational)',
    mechanism: 'continue-on-error',
    reason: INFORMATIONAL_SCENARIO,
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'Refresh load-test credentials (before the organization-write scenarios)',
    mechanism: 'continue-on-error',
    reason: CREDENTIAL_REFRESH,
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'k6 organization writes (informational)',
    mechanism: 'continue-on-error',
    reason: INFORMATIONAL_SCENARIO,
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'Seed the fe-full-surface user pool',
    mechanism: 'continue-on-error',
    reason:
      'feeds only the informational fe-full-surface scenario, which reports a missing pool itself',
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'k6 fe-full-surface (informational)',
    mechanism: 'continue-on-error',
    reason: INFORMATIONAL_SCENARIO,
  },
  {
    workflow: DATABASE_TESTS,
    step: 'Download the merged coverage',
    mechanism: 'continue-on-error',
    reason:
      'the report email reads coverage when it exists; a run whose coverage gate made no merged artifact still sends its pass/fail',
  },
  {
    workflow: DATABASE_TESTS,
    step: 'Send the test report email',
    mechanism: 'continue-on-error',
    reason: 'a notification, not a check: a mail outage must not fail the test run',
  },
  {
    workflow: NIGHTLY_LOAD,
    step: 'Send load-test results email (from k6 summaries)',
    mechanism: 'continue-on-error',
    reason: 'a notification, not a check: a mail outage must not fail the nightly load run',
  },
  {
    workflow: UPLOAD_API_DOCS,
    step: 'Upload Postman Collection to workspace',
    mechanism: 'continue-on-error',
    reason: 'best-effort publish after a deploy: a Postman outage never fails the caller',
  },
  {
    workflow: UPLOAD_API_DOCS,
    step: 'Upload OpenAPI to Scalar Registry',
    mechanism: 'continue-on-error',
    reason: 'best-effort publish after a deploy: a Scalar Registry outage never fails the caller',
  },
  {
    script: 'deps:audit:report',
    mechanism: 'report script',
    reason:
      'full-tree advisories are reported in every gate; the production tree (deps:audit:prod) is the gate',
  },
  {
    script: 'load:coverage:report',
    mechanism: 'report-only flag',
    reason:
      'the k6 route-coverage percentage is reported in every gate; src/tests/unit/ci/k6-coverage.policy.unit.test.ts holds the nightly coverage budget',
  },
];
