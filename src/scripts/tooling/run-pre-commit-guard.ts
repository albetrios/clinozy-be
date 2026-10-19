/**
 * Labeled pre-commit guard — same steps as `.husky/pre-commit`, with step names.
 * Run: `pnpm guard:pre-commit`, `pnpm guard:pre-commit:list`, or `pnpm guard:pre-commit --serial`.
 *
 * The steps that change the working tree, the index or `node_modules` run first, one at a time;
 * the read-only checks then run in parallel with their output captured. A check that fails there
 * runs again alone, with its output, and that run decides; if the parallel runner itself fails,
 * every step runs one at a time (`--serial` does that from the start).
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportEarlyCheck } from '@/scripts/tooling/early-checks.util.js';
import { DBML_OUTPUT_PATH } from '@/shared/constants/project-identity.constants.js';
import { requireTool } from '@tooling/setup/common/require-tool.js';

const ROUTES_CATALOG_PATH = 'docs/routes.txt';
const SRC_STRUCTURE_TREE_PATH = 'docs/reference/architecture/src-structure-tree.txt';
const DBML_PATH = DBML_OUTPUT_PATH;
/** Largest blob a commit may stage — 3 MB (parity with clinozy-fe's before-commit guard). */
const STAGED_FILE_LIMIT_BYTES = 3 * 1024 * 1024;
/**
 * Design iterations hold the design tool's exports (a prototype HTML/JS bundle and the specs
 * extracted from it) — reference material, never built or deployed — so the top-level
 * `iterations/` folder is exempt from the size limit, as in clinozy-fe.
 */
const SIZE_LIMIT_EXEMPT_PREFIX = 'iterations/';

/** Options for {@link runPreCommitGuard} — used by tests to stub staged files and scripts. */
export interface RunGuardOptions {
  listOnly?: boolean;
  stagedFiles?: string[];
  packageScripts?: Record<string, string>;
  skipShellSteps?: boolean;
  /** Every step one at a time, output on the terminal — the runner before the parallel one. */
  serial?: boolean;
}

function readPackageScripts(): Record<string, string> {
  const packageJsonPath = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return packageJson.scripts ?? {};
}

/** Returns paths currently staged for commit (`git diff --cached --name-only`). */
export function getStagedFiles(): string[] {
  try {
    const output = execSync('git diff --cached --name-only', {
      encoding: 'utf8',
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/** Returns whether `package.json` defines the given npm script name. */
export function hasPackageScript({
  scripts,
  scriptName,
}: {
  scripts: Record<string, string>;
  scriptName: string;
}): boolean {
  return typeof scripts[scriptName] === 'string';
}

/** Returns whether staged files touch OpenAPI route or generator sources. */
export function shouldRunOpenApiCheck(stagedFiles: string[]): boolean {
  const openApiPatterns = [
    /^src\/domains\/.*\.routes\.ts$/,
    /^src\/shared\/locales\/.*\/openapi\.json$/,
    /^tooling\/openapi\//,
    /^src\/scripts\/codegen\/generate-openapi\.ts$/,
    /^src\/scripts\/codegen\/openapi-/,
    /^src\/scripts\/codegen\/check-api-docs-sync\.ts$/,
  ];
  return stagedFiles.some((file) => openApiPatterns.some((pattern) => pattern.test(file)));
}

/** Returns whether staged files include SQL migrations. */
export function shouldRunMigrationCheck(stagedFiles: string[]): boolean {
  return stagedFiles.some((file) => /^migrations\/.*\.sql$/.test(file));
}

/**
 * Returns whether staged files touch the dependency manifest or lockfile — a
 * change to `package.json` deps or `pnpm-workspace.yaml` overrides that skips a
 * lockfile regen desyncs `pnpm-lock.yaml` and reds every frozen-install CI job.
 */
export function shouldRunLockfileCheck(stagedFiles: string[]): boolean {
  return stagedFiles.some(
    (file) =>
      file === 'package.json' || file === 'pnpm-lock.yaml' || file === 'pnpm-workspace.yaml',
  );
}

/** Returns whether staged files include a migration or a Drizzle schema (the RLS policy lint). */
export function shouldRunRlsPolicyLint(stagedFiles: string[]): boolean {
  return stagedFiles.some(
    (file) => /^migrations\/.*\.sql$/.test(file) || file.endsWith('.schema.ts'),
  );
}

/** Returns whether the lockfile is staged — what installs changed, so audit it before the commit. */
export function shouldRunLockfileAudit(stagedFiles: string[]): boolean {
  return stagedFiles.includes('pnpm-lock.yaml');
}

/** `pnpm audit` could not reach the registry — no verdict on the lockfile. */
const AUDIT_UNREACHABLE =
  /ERR_PNPM_AUDIT_(?:BAD_RESPONSE|NO_RESPONSE)|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i;

/**
 * `pnpm deps:audit:prod` on a staged lockfile, an early check: advisories warn until the early
 * checks block; an unreachable registry warns and passes (the PR's Security audit lane runs it).
 */
function runLockfileAudit(): number {
  const result = spawnSync('pnpm', ['deps:audit:prod'], { encoding: 'utf8', shell: false });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  if (result.status === 0) return 0;
  if (AUDIT_UNREACHABLE.test(output)) {
    console.warn('⚠ Dependency audit: the registry could not be reached — the PR audits it');
    return 0;
  }
  return reportEarlyCheck({
    check: 'Dependency audit (lockfile staged)',
    findings: ['pnpm audit --prod reported advisories — see above'],
  });
}

/** Returns whether staged files touch `src/` or `tooling/` (structure tree drift). */
export function shouldRunStructureTreeCheck(stagedFiles: string[]): boolean {
  return stagedFiles.some((file) => file.startsWith('src/') || file.startsWith('tooling/'));
}

/** Returns whether staged files include domain TypeScript files (controllers, services, workers, any domain layer). */
export function shouldRunGlobalTests(stagedFiles: string[]): boolean {
  return stagedFiles.some(
    (file) =>
      (file.startsWith('src/domains/') && file.endsWith('.ts')) ||
      // env-driven-config guard (no-nodeenv-branching.global.test.ts) scans the schema, the test
      // harness, the CI workflows, and the Docker files — trigger the global suite when they change.
      file === 'src/shared/config/env-schema.ts' ||
      file === 'src/tests/setup.ts' ||
      file === 'src/tests/chaos/bootstrap-env.ts' ||
      file.startsWith('.github/workflows/') ||
      file === 'Dockerfile' ||
      file === 'Dockerfile.worker' ||
      file === 'docker-compose.yml',
  );
}

function runPnpm({
  scriptName,
  scriptArgs = [],
}: {
  scriptName: string;
  scriptArgs?: string[] | undefined;
}): number {
  const result = spawnSync('pnpm', [scriptName, ...scriptArgs], {
    stdio: 'inherit',
    shell: false,
  });
  return result.status ?? 1;
}

function runShell(command: string): number {
  const result = spawnSync(command, { stdio: 'inherit', shell: true });
  return result.status ?? 1;
}

// The documented exception to the shared git module (tooling/setup/common/git-environment.ts):
// run inside the pre-commit hook, this stages into and reads the commit's own index — a temporary one for
// `git commit <paths>` — through the GIT_INDEX_FILE the hook inherits, which the module strips.
function gitAdd(paths: string[]): void {
  if (paths.length === 0) return;
  spawnSync('git', ['add', ...paths], { stdio: 'inherit' });
}

/**
 * Hard block on any staged secret/state file (defends against `git add -f`, which
 * bypasses .gitignore). gitleaks scans content; this rejects the files outright so
 * provisioned secrets in `.env.<environment>` / `.setup-state.*` can never be committed.
 */
function checkSecretFilesStaged(stagedFiles: string[]): number {
  const allowed = /(^|\/)\.env\.example$/;
  const secretFile =
    /(^|\/)\.env(\.[^/]*)?$|(^|\/)\.setup-credentials$|(^|\/)\.setup-state\.(json|lock|audit\.log)$|(^|\/)setup\.secrets\.json$/;
  const offenders = stagedFiles.filter((file) => secretFile.test(file) && !allowed.test(file));
  if (offenders.length > 0) {
    console.error(
      'ERROR: Refusing to commit secret/state files (these are gitignored for a reason):',
    );
    for (const file of offenders) console.error(`  ${file}`);
    console.error(
      'Secrets belong in .env.<environment> / .setup-state.json only — never in git. Unstage them (git restore --staged <file>).',
    );
    return 1;
  }
  return 0;
}

function checkConflictMarkers(stagedFiles: string[]): number {
  if (stagedFiles.length === 0) return 0;
  const result = spawnSync(
    'bash',
    [
      '-c',
      `git diff --cached --name-only -z | xargs -0 grep -lE '^<<<<<<<|^>>>>>>>|^=======$' 2>/dev/null || true`,
    ],
    { encoding: 'utf8', shell: false },
  );
  const conflictFiles = (result.stdout ?? '').trim();
  if (conflictFiles.length > 0) {
    console.error('ERROR: Merge conflict markers found in:');
    console.error(conflictFiles);
    return 1;
  }
  return 0;
}

/**
 * Lists the staged files over the 3 MB limit, skipping design iterations.
 *
 * @remarks
 * Pure — sizes come from the staged blobs ({@link checkLargeStagedFiles} reads them with
 * `git cat-file -s`), so the rule is testable without a repository. Only the top-level
 * `iterations/` folder is exempt, never a path that merely contains the word; a file exactly
 * at the limit passes.
 */
export function findOversizedStagedFiles(
  stagedSizes: ReadonlyArray<{ path: string; sizeBytes: number }>,
): string[] {
  return stagedSizes
    .filter(({ path }) => !path.startsWith(SIZE_LIMIT_EXEMPT_PREFIX))
    .filter(({ sizeBytes }) => Number.isFinite(sizeBytes) && sizeBytes > STAGED_FILE_LIMIT_BYTES)
    .map(({ path, sizeBytes }) => `  ${path} (${Math.floor(sizeBytes / 1024)}KB)`);
}

function checkLargeStagedFiles(stagedFiles: string[]): number {
  const stagedSizes: Array<{ path: string; sizeBytes: number }> = [];
  for (const file of stagedFiles) {
    // argv form (no shell) — filenames need no quoting, and stderr is piped so
    // an unresolvable path (rename/delete staging edge cases) stays silent
    // instead of leaking a `fatal:` line into the guard output.
    const result = spawnSync('git', ['cat-file', '-s', `:${file}`], {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) continue; // skip files git cannot resolve
    stagedSizes.push({ path: file, sizeBytes: Number.parseInt(result.stdout.trim(), 10) });
  }
  const largeFiles = findOversizedStagedFiles(stagedSizes);
  if (largeFiles.length > 0) {
    console.error(`ERROR: Files exceed 3MB limit:\n${largeFiles.join('\n')}`);
    return 1;
  }
  return 0;
}

function checkEnvExampleSync(): number {
  const result = spawnSync('pnpm', ['tool:sync-env-example'], {
    stdio: 'inherit',
    shell: false,
  });
  if (result.status === 0) return 0;
  console.error('ERROR: .env.example is out of sync with env schema.');
  console.error('Run: pnpm tool:sync-env-example --fix  (then add descriptions)');
  return result.status ?? 1;
}

/** A child process the parallel phase spawns: `file` with `args`, no shell. */
export interface StepCommand {
  file: string;
  args: string[];
}

/**
 * One step of the guard — the one list: what `--list` prints and what runs, its serial form and
 * the process it runs as in parallel.
 */
export interface RunnableStep {
  label: string;
  /** What the step runs, and when it applies — the `--list` table's last column. */
  description: string;
  /** Whether the step applies to the staged files (it is a no-op when it does not). */
  applies: boolean;
  /**
   * `write` changes the working tree, the index or `node_modules`, so it runs serially, before
   * every check; `check` only reads them.
   */
  phase: 'write' | 'check';
  /** Checks that share a lock never run at the same time (they write or read the same files). */
  lock?: string;
  /** Started first in the parallel phase, so the longest checks do not finish last. */
  slow?: boolean;
  /** Runs the step with its output on the terminal; returns the exit code (0 when it does not apply). */
  run: () => number;
  /**
   * The process the parallel phase spawns, its output captured; `null` when the step does not
   * apply to the staged files. Absent: the step runs in-process, after the processes.
   */
  command?: StepCommand | null;
}

/** How a step of the parallel phase ended. */
export interface StepOutcome {
  exitCode: number;
  durationMs: number;
  output: string;
}

/** At most four checks at once: the heavy ones (tsc, Vitest, the TSDoc walk) each want a core. */
const MAXIMUM_PARALLEL_CHECKS = 4;
/** Lines of a parallel run's output shown when the step then passes on its own. */
const PARALLEL_OUTPUT_TAIL_LINES = 20;

function pnpmStep(options: {
  label: string;
  scriptName: string;
  description?: string;
  applies?: boolean;
  lock?: string;
  slow?: boolean;
}): RunnableStep {
  const { label, scriptName, applies = true } = options;
  return {
    label,
    description: options.description ?? `pnpm ${scriptName}`,
    applies,
    phase: 'check',
    ...(options.lock === undefined ? {} : { lock: options.lock }),
    ...(options.slow === undefined ? {} : { slow: options.slow }),
    run: () => (applies ? runPnpm({ scriptName }) : 0),
    command: applies ? { file: 'pnpm', args: [scriptName] } : null,
  };
}

/** Builds the steps the guard executes, in the order the serial runner runs them. */
export function buildRunnableSteps(options: {
  stagedFiles: string[];
  scripts: Record<string, string>;
  skipShellSteps?: boolean | undefined;
}): RunnableStep[] {
  const { stagedFiles, scripts } = options;
  // `pnpm test:global` writes docs/openapi/openapi.json when it is missing and reads it;
  // `pnpm docs:check` regenerates it. Never both at once.
  const apiDocsLock = 'docs/openapi';
  const steps: RunnableStep[] = [
    {
      label: 'lint-staged (Biome + markdownlint)',
      description: 'pnpm lint-staged',
      applies: true,
      phase: 'write',
      run: () => runPnpm({ scriptName: 'lint-staged', scriptArgs: ['--no-stash'] }),
    },
    {
      // `pnpm install --frozen-lockfile` rewrites node_modules under every other check.
      label: 'Lockfile in sync',
      description:
        'pnpm validate:lockfile (when package.json / pnpm-lock.yaml / pnpm-workspace.yaml staged)',
      applies: shouldRunLockfileCheck(stagedFiles),
      phase: 'write',
      run: () =>
        shouldRunLockfileCheck(stagedFiles) ? runPnpm({ scriptName: 'validate:lockfile' }) : 0,
    },
    pnpmStep({ label: 'TypeScript typecheck', scriptName: 'typecheck', slow: true }),
    pnpmStep({ label: 'Domain structure (strict)', scriptName: 'validate:domain:strict' }),
    pnpmStep({
      label: 'Architecture policy tests',
      scriptName: 'test:global',
      description:
        'pnpm test:global (service boundary, no direct DB, import paths, no NODE_ENV branching — when domains / env-schema / harness / workflows / Docker staged)',
      applies: shouldRunGlobalTests(stagedFiles),
      lock: apiDocsLock,
      slow: true,
    }),
    pnpmStep({ label: 'Scripts layout', scriptName: 'validate:scripts-layout' }),
    {
      label: 'Route catalog regenerate',
      description: 'pnpm routes:catalog + git add docs/routes.txt',
      applies: true,
      phase: 'write',
      run: () => {
        const code = runPnpm({ scriptName: 'routes:catalog' });
        if (code !== 0) return code;
        gitAdd([ROUTES_CATALOG_PATH]);
        return 0;
      },
    },
    pnpmStep({ label: 'Route catalog drift check', scriptName: 'routes:catalog:check' }),
  ];

  if (hasPackageScript({ scripts, scriptName: 'tool:project-structure-tree' })) {
    steps.push({
      label: 'Source tree regenerate',
      description: `pnpm tool:project-structure-tree + git add ${SRC_STRUCTURE_TREE_PATH} (when src/** or tooling/** staged)`,
      applies: shouldRunStructureTreeCheck(stagedFiles),
      phase: 'write',
      run: () => {
        if (!shouldRunStructureTreeCheck(stagedFiles)) return 0;
        const code = runPnpm({ scriptName: 'tool:project-structure-tree' });
        if (code !== 0) return code;
        gitAdd([SRC_STRUCTURE_TREE_PATH]);
        return 0;
      },
    });
  }

  if (hasPackageScript({ scripts, scriptName: 'tool:project-structure-tree:check' })) {
    steps.push(
      pnpmStep({
        label: 'Source tree drift check',
        scriptName: 'tool:project-structure-tree:check',
        description: 'pnpm tool:project-structure-tree:check (when src/** or tooling/** staged)',
        applies: shouldRunStructureTreeCheck(stagedFiles),
      }),
    );
  }

  steps.push(
    pnpmStep({
      label: 'OpenAPI / Postman drift',
      scriptName: 'docs:check',
      description: 'pnpm docs:check (when OpenAPI inputs staged)',
      applies: shouldRunOpenApiCheck(stagedFiles),
      lock: apiDocsLock,
      slow: true,
    }),
    pnpmStep({ label: 'TSDoc coverage gate', scriptName: 'tsdoc:check', slow: true }),
  );

  if (hasPackageScript({ scripts, scriptName: 'validate:test-naming' })) {
    steps.push(pnpmStep({ label: 'Test filename suffixes', scriptName: 'validate:test-naming' }));
  }

  steps.push(
    pnpmStep({
      label: 'Migration SQL safety',
      scriptName: 'db:migrate:lint',
      description: 'pnpm db:migrate:lint (when migrations/*.sql staged)',
      applies: shouldRunMigrationCheck(stagedFiles),
    }),
    {
      label: 'DBML regenerate',
      description: `pnpm tool:generate-dbdiagram + git add ${DBML_PATH} (when migrations staged)`,
      applies: shouldRunMigrationCheck(stagedFiles),
      phase: 'write',
      run: () => {
        if (!shouldRunMigrationCheck(stagedFiles)) return 0;
        const code = runPnpm({ scriptName: 'tool:generate-dbdiagram' });
        if (code !== 0) return code;
        gitAdd([DBML_PATH]);
        return 0;
      },
    },
    pnpmStep({
      label: 'Project identity drift',
      scriptName: 'tool:generate-project-identity:check',
    }),
    {
      label: 'Env example sync',
      description: 'pnpm tool:sync-env-example',
      applies: true,
      phase: 'check',
      run: () => checkEnvExampleSync(),
      command: { file: 'pnpm', args: ['tool:sync-env-example'] },
    },
  );

  if (!options.skipShellSteps) {
    steps.push(
      {
        label: 'Staged secrets scan',
        description:
          'gitleaks protect --staged --redact --verbose --config .gitleaks.toml (the same flags as clinozy-fe)',
        applies: true,
        phase: 'check',
        run: () => {
          if (
            !requireTool({ name: 'gitleaks', mode: 'block', purpose: 'the staged secrets scan' })
          ) {
            return 1;
          }
          return runShell('gitleaks protect --staged --redact --verbose --config .gitleaks.toml');
        },
        command: {
          file: 'gitleaks',
          args: ['protect', '--staged', '--redact', '--verbose', '--config', '.gitleaks.toml'],
        },
      },
      {
        label: 'No secret/state files staged',
        description:
          'reject staged .env.<env> / .setup-credentials / .setup-state.* / setup.secrets.json (force-add guard)',
        applies: true,
        phase: 'check',
        run: () => checkSecretFilesStaged(stagedFiles),
      },
      {
        label: 'Merge conflict markers',
        description: 'grep staged files for conflict markers',
        applies: true,
        phase: 'check',
        run: () => checkConflictMarkers(stagedFiles),
      },
      {
        label: 'Large staged files (>3MB; iterations/ exempt)',
        description: 'reject staged files over 3MB (iterations/ design exports exempt)',
        applies: true,
        phase: 'check',
        run: () => checkLargeStagedFiles(stagedFiles),
      },
    );
  }

  // The early checks run in-process (no `command`), so their warnings reach the terminal —
  // the parallel phase shows nothing of a check that passes.
  steps.push(
    {
      label: 'RLS policy lint',
      description:
        'pnpm validate:rls-policies — ENABLE + FORCE + tenant WITH CHECK on the tables the staged migrations / schemas touch; a finding blocks',
      applies: shouldRunRlsPolicyLint(stagedFiles),
      phase: 'check',
      run: () =>
        shouldRunRlsPolicyLint(stagedFiles) ? runPnpm({ scriptName: 'validate:rls-policies' }) : 0,
    },
    {
      label: 'Route access diff',
      description:
        'pnpm routes:access-diff — staged docs/routes.txt vs HEAD; lists each access widening for the PR description (never blocks)',
      applies: true,
      phase: 'check',
      run: () => runPnpm({ scriptName: 'routes:access-diff' }),
    },
    {
      label: 'Dependency audit (lockfile staged)',
      description:
        'pnpm deps:audit:prod when pnpm-lock.yaml is staged; an unreachable registry passes; an advisory blocks',
      applies: shouldRunLockfileAudit(stagedFiles),
      phase: 'check',
      run: () => (shouldRunLockfileAudit(stagedFiles) ? runLockfileAudit() : 0),
    },
  );

  return steps;
}

/** The `--list` table: the steps that run, numbered as the runner numbers them. */
function printStepTable(steps: readonly RunnableStep[]): void {
  console.log('| Step | Label | When |');
  console.log('|------|-------|------|');
  steps.forEach((step, index) => {
    console.log(`| ${index + 1} | ${step.label} | ${step.description} |`);
  });
}

function runStep(options: {
  stepNumber: number;
  stepTotal: number;
  label: string;
  run: () => number;
}): number {
  const { stepNumber, stepTotal, label, run } = options;
  console.log(`▶ Step ${stepNumber}/${stepTotal}: ${label}`);
  const exitCode = run();
  if (exitCode === 0) {
    console.log(`✓ ${label}`);
    return 0;
  }
  console.error(`✗ FAILED at step ${stepNumber}/${stepTotal}: ${label} (exit ${exitCode})`);
  return exitCode;
}

/** Runs every step one after another, output on the terminal; stops at the first failure. */
export function runStepsSerially(steps: readonly RunnableStep[]): number {
  const stepTotal = steps.length;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    const exitCode = runStep({
      stepNumber: index + 1,
      stepTotal,
      label: step.label,
      run: step.run,
    });
    if (exitCode !== 0) return exitCode;
  }
  return 0;
}

/**
 * Runs `steps` through `start`, at most `concurrency` at once and never two that share a lock;
 * resolves with each step's outcome, in the order of `steps`.
 */
export function runStepPool<Step extends { lock?: string | undefined }>(options: {
  steps: readonly Step[];
  concurrency: number;
  start: (step: Step) => Promise<StepOutcome>;
}): Promise<StepOutcome[]> {
  const { steps, start } = options;
  const concurrency = Math.max(1, options.concurrency);
  const outcomes = new Array<StepOutcome>(steps.length);
  const waiting = steps.map((_, index) => index);
  const heldLocks = new Set<string>();
  let running = 0;
  return new Promise((resolvePool, rejectPool) => {
    const launchNext = (): void => {
      if (waiting.length === 0 && running === 0) {
        resolvePool(outcomes);
        return;
      }
      while (running < concurrency) {
        const position = waiting.findIndex((index) => {
          const lock = steps[index]!.lock;
          return lock === undefined || !heldLocks.has(lock);
        });
        if (position < 0) return;
        const index = waiting.splice(position, 1)[0]!;
        const step = steps[index]!;
        if (step.lock !== undefined) heldLocks.add(step.lock);
        running += 1;
        start(step).then((outcome) => {
          outcomes[index] = outcome;
          running -= 1;
          if (step.lock !== undefined) heldLocks.delete(step.lock);
          launchNext();
        }, rejectPool);
      }
    };
    launchNext();
  });
}

/** Spawns a step's process with its output captured; a process that cannot start fails the step. */
function spawnCommand(command: StepCommand): Promise<StepOutcome> {
  const startedAt = Date.now();
  return new Promise((resolveStep) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      resolveStep({
        exitCode,
        durationMs: Date.now() - startedAt,
        output: Buffer.concat(chunks).toString('utf8'),
      });
    };
    const child = spawn(command.file, command.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (error) => {
      chunks.push(Buffer.from(`${error.message}\n`));
      finish(1);
    });
    child.on('close', (code) => finish(code ?? 1));
  });
}

function seconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function outputTail(output: string): string {
  return output.trimEnd().split('\n').slice(-PARALLEL_OUTPUT_TAIL_LINES).join('\n');
}

/**
 * Runs the steps in three phases: the writers one at a time, in order; the process checks in
 * parallel with their output captured; then the in-process checks. A check that fails in
 * parallel runs again alone with its output on the terminal, and that run decides.
 */
export async function runStepsInParallel(options: {
  steps: readonly RunnableStep[];
  concurrency: number;
  start?: (command: StepCommand) => Promise<StepOutcome>;
}): Promise<number> {
  const { steps, concurrency, start = spawnCommand } = options;
  const stepTotal = steps.length;
  const numbered = steps.map((step, index) => ({ step, stepNumber: index + 1 }));
  const runNumbered = ({ step, stepNumber }: (typeof numbered)[number]): number =>
    runStep({ stepNumber, stepTotal, label: step.label, run: step.run });

  for (const entry of numbered.filter(({ step }) => step.phase === 'write')) {
    const exitCode = runNumbered(entry);
    if (exitCode !== 0) return exitCode;
  }

  const checks = numbered.filter(({ step }) => step.phase === 'check');
  const processChecks = checks
    .filter(({ step }) => step.command !== undefined)
    .sort((left, right) => Number(right.step.slow === true) - Number(left.step.slow === true));
  const applicable = processChecks.filter(({ step }) => step.command !== null);
  console.log(
    `▶ ${applicable.length} checks in parallel, up to ${Math.max(1, concurrency)} at a time`,
  );
  const outcomes = await runStepPool({
    steps: processChecks.map((entry) => ({ ...entry, lock: entry.step.lock })),
    concurrency,
    start: ({ step }) =>
      step.command === null || step.command === undefined
        ? Promise.resolve({ exitCode: 0, durationMs: 0, output: '' })
        : start(step.command),
  });

  const failed: Array<{ entry: (typeof numbered)[number]; outcome: StepOutcome }> = [];
  processChecks.forEach((entry, index) => {
    const outcome = outcomes[index]!;
    if (entry.step.command === null) {
      console.log(`○ ${entry.step.label} (not needed for the staged files)`);
    } else if (outcome.exitCode === 0) {
      console.log(`✓ ${entry.step.label} (${seconds(outcome.durationMs)})`);
    } else {
      console.error(
        `✗ ${entry.step.label} failed in parallel (exit ${outcome.exitCode}, ${seconds(outcome.durationMs)}) — running it again alone`,
      );
      failed.push({ entry, outcome });
    }
  });

  for (const entry of checks.filter(({ step }) => step.command === undefined)) {
    const exitCode = runNumbered(entry);
    if (exitCode !== 0) return exitCode;
  }

  failed.sort((left, right) => left.entry.stepNumber - right.entry.stepNumber);
  for (const { entry, outcome } of failed) {
    const exitCode = runNumbered(entry);
    if (exitCode !== 0) return exitCode;
    console.log(
      `  ${entry.step.label} passed alone after failing in parallel; the parallel run's output ended:\n${outputTail(outcome.output)}`,
    );
  }
  return 0;
}

/** Runs the labeled pre-commit guard; resolves with the process exit code (0 = success). */
export async function runPreCommitGuard(options: RunGuardOptions = {}): Promise<number> {
  const scripts = options.packageScripts ?? readPackageScripts();
  const stagedFiles = options.stagedFiles ?? getStagedFiles();

  if (options.listOnly) {
    printStepTable(buildRunnableSteps({ stagedFiles, scripts }));
    return 0;
  }

  const steps = buildRunnableSteps({
    stagedFiles,
    scripts,
    skipShellSteps: options.skipShellSteps,
  });
  if (options.serial) return runStepsSerially(steps);
  return runWithSerialFallback({
    parallel: () =>
      runStepsInParallel({
        steps,
        concurrency: Math.min(MAXIMUM_PARALLEL_CHECKS, availableParallelism()),
      }),
    serial: () => runStepsSerially(steps),
  });
}

/** Resolves with the parallel run's exit code, or, when the runner itself throws, the serial run's. */
export async function runWithSerialFallback(options: {
  parallel: () => Promise<number>;
  serial: () => number;
}): Promise<number> {
  try {
    return await options.parallel();
  } catch (error) {
    console.error(
      `The parallel guard failed (${error instanceof Error ? error.message : String(error)}); running every step one at a time.`,
    );
    return options.serial();
  }
}

const currentScriptPath = resolve(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const exitCode = await runPreCommitGuard({
    listOnly: process.argv.includes('--list'),
    serial: process.argv.includes('--serial'),
  });
  process.exit(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === currentScriptPath) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
