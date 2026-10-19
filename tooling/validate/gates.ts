/**
 * The one list of gate steps behind `pnpm ci:quality`, `pnpm ci:local` and `pnpm health`
 * (`tooling/validate/run-gate.ts`). Each step names the gates that run it, so the three can never
 * drift apart again: `ci:local` is every `ci:quality` step plus the build and the full test suite,
 * and `pnpm health` is `ci:local` with the database-free fast tests in place of the full suite.
 */

/** A gate that runs steps from {@link GATE_STEPS}. */
export type GateName = 'quality' | 'local' | 'health';

/** One step: a label for the summary, the command it runs, and the gates it belongs to. */
export type GateStep = {
  label: string;
  /** The command and its arguments; a bare script name runs as `pnpm <script>`. */
  command: readonly string[];
  gates: readonly GateName[];
};

/** Every gate: a step all three run. */
const ALL: readonly GateName[] = ['quality', 'local', 'health'];

/**
 * Every gate step, in run order.
 *
 * @remarks
 * `ci:quality` is the static slice the nightly main canary runs (`scheduled-main-canary.yml`);
 * `ci:local` is the PR gate a contributor runs before opening a PR; `pnpm health` is the
 * developer-loop diagnostic that continues through failures. The full suite needs Postgres and
 * Redis, so `health` runs `test:fast` instead, and the route success gate — which reads the full
 * suite's observations — runs in `ci:local` only. `test:property` runs on its own in
 * `ci:quality` only: the other two run it inside their test step.
 */
export const GATE_STEPS: readonly GateStep[] = [
  { label: 'Dependency audit (production tree)', command: ['pnpm', 'deps:audit:prod'], gates: ALL },
  {
    label: 'Dependency audit (full tree, report)',
    command: ['pnpm', 'deps:audit:report'],
    gates: ALL,
  },
  { label: 'Lint, format, types, markdown', command: ['pnpm', 'validate'], gates: ALL },
  { label: 'Scripts layout', command: ['pnpm', 'validate:scripts-layout'], gates: ALL },
  { label: 'Domain structure', command: ['pnpm', 'validate:domain:strict'], gates: ALL },
  { label: 'Domain coverage', command: ['pnpm', 'validate:domain:coverage'], gates: ALL },
  { label: 'Domain unit matrix', command: ['pnpm', 'validate:domain:unit-matrix'], gates: ALL },
  { label: 'Constants centralization', command: ['pnpm', 'validate:constants'], gates: ALL },
  { label: 'Test API prefix', command: ['pnpm', 'validate:test-api-prefix'], gates: ALL },
  { label: 'API docs hub', command: ['pnpm', 'validate:api-docs-hub'], gates: ALL },
  { label: 'Test naming', command: ['pnpm', 'validate:test-naming'], gates: ALL },
  { label: 'Property tests', command: ['pnpm', 'test:property'], gates: ['quality'] },
  { label: 'Contract tests', command: ['pnpm', 'test:contract'], gates: ALL },
  { label: 'Route catalog drift', command: ['pnpm', 'routes:catalog:check'], gates: ALL },
  { label: 'Load coverage (report)', command: ['pnpm', 'load:coverage:report'], gates: ALL },
  { label: 'Route HTTP coverage', command: ['pnpm', 'validate:route-http-coverage'], gates: ALL },
  {
    label: 'Route success statuses',
    command: ['pnpm', 'validate:route-success-statuses'],
    gates: ALL,
  },
  { label: 'Route schema docs', command: ['pnpm', 'validate:route-schema-docs'], gates: ALL },
  { label: 'Route param schemas', command: ['pnpm', 'validate:route-param-schemas'], gates: ALL },
  {
    label: 'Route organization scope',
    command: ['pnpm', 'validate:route-organization-scope'],
    gates: ALL,
  },
  {
    label: 'Structure tree drift',
    command: ['pnpm', 'tool:project-structure-tree:check'],
    gates: ALL,
  },
  { label: 'OpenAPI / Postman sync', command: ['pnpm', 'docs:check'], gates: ALL },
  { label: 'Docs links + cited paths', command: ['pnpm', 'docs:links:check'], gates: ALL },
  { label: 'TSDoc coverage', command: ['pnpm', 'tsdoc:check'], gates: ALL },
  { label: 'agent-os integrity', command: ['pnpm', 'agent-os:check'], gates: ALL },
  { label: 'agent-os triggers', command: ['pnpm', 'agent-os:triggers:strict'], gates: ALL },
  { label: 'agent-os generate drift', command: ['pnpm', 'agent-os:generate:check'], gates: ALL },
  { label: 'agent-os skills lock', command: ['pnpm', 'agent-os:lock:check'], gates: ALL },
  { label: 'agent-os outcomes', command: ['pnpm', 'agent-os:outcomes'], gates: ALL },
  { label: 'agent-os guards', command: ['pnpm', 'agent-os:guards'], gates: ALL },
  { label: 'Env example sync', command: ['pnpm', 'tool:sync-env-example'], gates: ALL },
  {
    label: 'Project identity',
    command: ['pnpm', 'tool:generate-project-identity:check'],
    gates: ALL,
  },
  { label: 'Migration lint', command: ['pnpm', 'db:migrate:lint'], gates: ALL },
  { label: 'Knip (dead code)', command: ['pnpm', 'knip'], gates: ALL },
  { label: 'Build', command: ['pnpm', 'build'], gates: ['local', 'health'] },
  { label: 'Build alias check', command: ['pnpm', 'build:check'], gates: ['local', 'health'] },
  {
    label: 'Fast tests (unit, property, global)',
    command: ['pnpm', 'test:fast'],
    gates: ['health'],
  },
  { label: 'Full test suite', command: ['pnpm', 'test'], gates: ['local'] },
  {
    label: 'Route success coverage',
    command: ['pnpm', 'validate:route-success-coverage'],
    gates: ['local'],
  },
];

/** The steps `gate` runs, in order. */
export function stepsFor(gate: GateName): readonly GateStep[] {
  return GATE_STEPS.filter((step) => step.gates.includes(gate));
}
