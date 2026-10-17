import { describe, expect, it, vi } from 'vitest';
import {
  buildGuardSteps,
  buildRunnableSteps,
  findOversizedStagedFiles,
  hasPackageScript,
  shouldRunGlobalTests,
  shouldRunLockfileCheck,
  shouldRunMigrationCheck,
  shouldRunOpenApiCheck,
  shouldRunSonarScan,
  shouldRunStructureTreeCheck,
  type RunnableStep,
  runStepPool,
  runStepsInParallel,
  runWithSerialFallback,
  type StepOutcome,
} from '@/scripts/tooling/run-pre-commit-guard.js';

describe('run-pre-commit-guard conditionals', () => {
  const baseScripts = {
    'tool:project-structure-tree': 'tsx src/scripts/codegen/generate-project-structure-tree.ts',
    'validate:test-naming': 'tsx src/scripts/validators/tests/validate-test-naming.ts',
  };

  it('detects OpenAPI-related staged paths', () => {
    expect(shouldRunOpenApiCheck(['src/domains/auth/auth.service.ts'])).toBe(false);
    expect(
      shouldRunOpenApiCheck(['src/domains/auth/sub-domains/auth-session/auth-session.routes.ts']),
    ).toBe(true);
    expect(shouldRunOpenApiCheck(['src/shared/locales/en/openapi.json'])).toBe(true);
  });

  it('detects migration and structure-tree staged paths', () => {
    expect(shouldRunMigrationCheck(['migrations/20260531000001_test.sql'])).toBe(true);
    expect(shouldRunMigrationCheck(['src/domains/auth/auth.routes.ts'])).toBe(false);
    expect(shouldRunStructureTreeCheck(['src/domains/auth/auth.routes.ts'])).toBe(true);
    expect(shouldRunStructureTreeCheck(['tooling/ci/run-named-step.sh'])).toBe(true);
    expect(shouldRunStructureTreeCheck(['docs/README.md'])).toBe(false);
  });

  it('detects dependency-manifest / lockfile staged paths', () => {
    expect(shouldRunLockfileCheck(['package.json'])).toBe(true);
    expect(shouldRunLockfileCheck(['pnpm-lock.yaml'])).toBe(true);
    expect(shouldRunLockfileCheck(['pnpm-workspace.yaml'])).toBe(true);
    // Nested/unrelated files do not trigger the frozen-install check.
    expect(shouldRunLockfileCheck(['tooling/setup/package.json'])).toBe(false);
    expect(shouldRunLockfileCheck(['src/domains/auth/auth.service.ts'])).toBe(false);
  });

  it('marks the lockfile step always/conditional based on staged manifest/lockfile', () => {
    const withManifest = buildGuardSteps({
      stagedFiles: ['package.json'],
      scripts: baseScripts,
    });
    expect(withManifest.find((step) => step.id === '1b')?.when).toBe('always');

    const withoutManifest = buildGuardSteps({
      stagedFiles: ['docs/README.md'],
      scripts: baseScripts,
    });
    expect(withoutManifest.find((step) => step.id === '1b')?.when).toBe('conditional');
  });

  it('runs the global suite for domains, env-schema, harness, workflows, and Docker changes', () => {
    expect(shouldRunGlobalTests(['src/domains/auth/auth.service.ts'])).toBe(true);
    // env-driven-config guard surfaces (no-nodeenv-branching.global.test.ts scans these).
    expect(shouldRunGlobalTests(['src/shared/config/env-schema.ts'])).toBe(true);
    expect(shouldRunGlobalTests(['src/tests/setup.ts'])).toBe(true);
    expect(shouldRunGlobalTests(['src/tests/chaos/bootstrap-env.ts'])).toBe(true);
    expect(shouldRunGlobalTests(['.github/workflows/pr-ci.yml'])).toBe(true);
    expect(shouldRunGlobalTests(['Dockerfile'])).toBe(true);
    expect(shouldRunGlobalTests(['docker-compose.yml'])).toBe(true);
    // Unrelated files do not trigger the global suite.
    expect(shouldRunGlobalTests(['docs/README.md'])).toBe(false);
    expect(shouldRunGlobalTests(['src/shared/utils/text/slug.util.ts'])).toBe(false);
  });

  it('detects deployed-surface staged paths for the SonarQube gate', () => {
    expect(shouldRunSonarScan(['src/domains/auth/auth.service.ts'])).toBe(true);
    expect(shouldRunSonarScan(['src/shared/utils/http/response.util.ts'])).toBe(true);
    // Tests, scripts, and tooling are excluded from Sonar analysis.
    expect(shouldRunSonarScan(['src/domains/auth/__tests__/auth.test.ts'])).toBe(false);
    expect(shouldRunSonarScan(['src/domains/auth/auth.service.test.ts'])).toBe(false);
    expect(shouldRunSonarScan(['src/tests/unit/scripts/run-pre-commit-guard.unit.test.ts'])).toBe(
      false,
    );
    expect(shouldRunSonarScan(['src/scripts/tooling/run-pre-commit-guard.ts'])).toBe(false);
    expect(shouldRunSonarScan(['tooling/sonar/sonar-gate.ts'])).toBe(false);
    expect(shouldRunSonarScan(['docs/README.md'])).toBe(false);
  });

  it('marks the SonarQube step always/conditional based on staged runtime code', () => {
    const withRuntime = buildGuardSteps({
      stagedFiles: ['src/domains/auth/auth.service.ts'],
      scripts: baseScripts,
    });
    expect(withRuntime.find((step) => step.id === '17')?.when).toBe('always');

    const withoutRuntime = buildGuardSteps({
      stagedFiles: ['docs/README.md'],
      scripts: baseScripts,
    });
    expect(withoutRuntime.find((step) => step.id === '17')?.when).toBe('conditional');
  });

  it('includes optional steps only when package scripts exist', () => {
    expect(hasPackageScript({ scripts: baseScripts, scriptName: 'validate:test-naming' })).toBe(
      true,
    );
    expect(
      hasPackageScript({ scripts: baseScripts, scriptName: 'tool:project-structure-tree:check' }),
    ).toBe(false);

    const stepsWithoutCheck = buildGuardSteps({
      stagedFiles: ['src/domains/auth/auth.routes.ts'],
      scripts: baseScripts,
    });
    expect(stepsWithoutCheck.some((step) => step.id === '9')).toBe(true);
    expect(stepsWithoutCheck.some((step) => step.id === '6c')).toBe(false);

    const stepsWithCheck = buildGuardSteps({
      stagedFiles: ['docs/README.md'],
      scripts: {
        ...baseScripts,
        'tool:project-structure-tree:check':
          'tsx src/scripts/codegen/generate-project-structure-tree.ts --check',
      },
    });
    expect(stepsWithCheck.some((step) => step.id === '6c')).toBe(true);
  });

  it('labels the large-file step with the 3MB limit and the iterations/ exemption', () => {
    const largeFileStep = buildGuardSteps({ stagedFiles: [], scripts: baseScripts }).find(
      (step) => step.id === '16',
    );
    expect(largeFileStep?.label).toBe('Large staged files (>3MB; iterations/ exempt)');
    expect(largeFileStep?.when).toBe('always');
  });

  it('omits validate:test-naming when script is missing', () => {
    const steps = buildGuardSteps({
      stagedFiles: [],
      scripts: { 'tool:project-structure-tree': 'tsx ...' },
    });
    expect(steps.some((step) => step.id === '9')).toBe(false);
  });
});

describe('run-pre-commit-guard staged-file size limit (parity with clinozy-fe)', () => {
  const LIMIT_BYTES = 3 * 1024 * 1024;

  it('rejects a staged file over the limit', () => {
    expect(findOversizedStagedFiles([{ path: 'src/big.bin', sizeBytes: LIMIT_BYTES + 1 }])).toEqual(
      ['  src/big.bin (3072KB)'],
    );
  });

  it('allows a 2MB file — over the old 1MB limit, under 3MB', () => {
    expect(findOversizedStagedFiles([{ path: 'src/two.bin', sizeBytes: 2 * 1024 * 1024 }])).toEqual(
      [],
    );
  });

  it('allows a staged file exactly at the limit', () => {
    expect(findOversizedStagedFiles([{ path: 'src/edge.bin', sizeBytes: LIMIT_BYTES }])).toEqual(
      [],
    );
  });

  it('exempts design exports under iterations/', () => {
    expect(
      findOversizedStagedFiles([
        { path: 'iterations/launch-x/intake-files/Prototype.html', sizeBytes: LIMIT_BYTES * 3 },
      ]),
    ).toEqual([]);
  });

  it('does not let the iterations/ exemption hide a large file elsewhere in the same commit', () => {
    const flagged = findOversizedStagedFiles([
      { path: 'iterations/launch-x/intake-files/Prototype.html', sizeBytes: LIMIT_BYTES * 3 },
      { path: 'docs/big.bin', sizeBytes: LIMIT_BYTES + 1 },
    ]);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toContain('docs/big.bin');
  });

  it.each(['docs/iterations/big.bin', 'iterations-archive/big.bin', 'iterations.bin'])(
    'does not exempt %s — only the top-level iterations/ folder is exempt',
    (path) => {
      expect(findOversizedStagedFiles([{ path, sizeBytes: LIMIT_BYTES + 1 }])).toHaveLength(1);
    },
  );
});

describe('run-pre-commit-guard parallel runner', () => {
  const scripts = {
    'tool:project-structure-tree': 'tsx src/scripts/codegen/generate-project-structure-tree.ts',
    'tool:project-structure-tree:check':
      'tsx src/scripts/codegen/generate-project-structure-tree.ts --check',
    'validate:test-naming': 'tsx src/scripts/validators/tests/validate-test-naming.ts',
  };
  const passed: StepOutcome = { exitCode: 0, durationMs: 1, output: '' };

  /** A check whose serial run records itself in `calls` and returns `exitCode`. */
  function check(options: {
    label: string;
    calls: string[];
    exitCode?: number;
    lock?: string;
    command?: RunnableStep['command'];
  }): RunnableStep {
    const { label, calls, exitCode = 0, lock } = options;
    return {
      label,
      phase: 'check',
      ...(lock === undefined ? {} : { lock }),
      run: () => {
        calls.push(`serial ${label}`);
        return exitCode;
      },
      command: options.command === undefined ? { file: label, args: [] } : options.command,
    };
  }

  it('keeps the step list: the same steps, in the order --list prints them', () => {
    const stagedFiles = ['src/domains/auth/auth.routes.ts', 'migrations/20260531000001_test.sql'];
    const listed = buildGuardSteps({ stagedFiles, scripts }).map((step) => step.label);
    const runnable = buildRunnableSteps({ stagedFiles, scripts }).map((step) => step.label);
    expect(runnable).toEqual(listed);
  });

  it('runs the steps that write the tree, the index or node_modules one at a time', () => {
    const steps = buildRunnableSteps({ stagedFiles: [], scripts });
    expect(steps.filter((step) => step.phase === 'write').map((step) => step.label)).toEqual([
      'lint-staged (Biome + markdownlint)',
      'Lockfile in sync',
      'Route catalog regenerate',
      'Source tree regenerate',
      'DBML regenerate',
    ]);
    const lockOf = (label: string) => steps.find((step) => step.label === label)?.lock;
    expect(lockOf('Architecture policy tests')).toBe('docs/openapi');
    expect(lockOf('OpenAPI / Postman drift')).toBe('docs/openapi');
  });

  it('skips the processes of conditional checks the staged files do not need', () => {
    const steps = buildRunnableSteps({ stagedFiles: ['docs/README.md'], scripts });
    const commandOf = (label: string) => steps.find((step) => step.label === label)?.command;
    expect(commandOf('Architecture policy tests')).toBeNull();
    expect(commandOf('SonarQube quality gate')).toBeNull();
    expect(commandOf('TypeScript typecheck')).toEqual({ file: 'pnpm', args: ['typecheck'] });
  });

  it('starts at most `concurrency` steps at once and never two that share a lock', async () => {
    const steps = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => ({
      name,
      ...(name === 'b' || name === 'c' ? { lock: 'shared' } : {}),
    }));
    let running = 0;
    let peak = 0;
    const lockHolders = new Set<string>();
    const outcomes = await runStepPool({
      steps,
      concurrency: 3,
      start: async (step) => {
        running += 1;
        peak = Math.max(peak, running);
        if (step.lock !== undefined) {
          expect(lockHolders.has(step.lock)).toBe(false);
          lockHolders.add(step.lock);
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
        if (step.lock !== undefined) lockHolders.delete(step.lock);
        running -= 1;
        return { exitCode: step.name === 'e' ? 1 : 0, durationMs: 5, output: step.name };
      },
    });
    expect(peak).toBe(3);
    expect(outcomes.map((outcome) => outcome.output)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(outcomes[4]?.exitCode).toBe(1);
  });

  it('runs the writers first, then the checks; an applicable check is not run serially', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const calls: string[] = [];
    const steps: RunnableStep[] = [
      check({ label: 'typecheck', calls }),
      {
        label: 'regenerate',
        phase: 'write',
        run: () => {
          calls.push('serial regenerate');
          return 0;
        },
      },
      check({ label: 'not needed', calls, command: null }),
    ];
    const started: string[] = [];
    const exitCode = await runStepsInParallel({
      steps,
      concurrency: 2,
      start: async (command) => {
        started.push(command.file);
        calls.push(`parallel ${command.file}`);
        return passed;
      },
    });
    expect(exitCode).toBe(0);
    expect(calls).toEqual(['serial regenerate', 'parallel typecheck']);
    expect(started).toEqual(['typecheck']);
  });

  it('runs a check that failed in parallel again alone, and the run alone decides', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failInParallel = async (): Promise<StepOutcome> => ({
      exitCode: 1,
      durationMs: 1,
      output: 'contention',
    });

    const flakyCalls: string[] = [];
    const flaky = await runStepsInParallel({
      steps: [check({ label: 'flaky', calls: flakyCalls })],
      concurrency: 2,
      start: failInParallel,
    });
    expect(flaky).toBe(0);
    expect(flakyCalls).toEqual(['serial flaky']);

    const brokenCalls: string[] = [];
    const broken = await runStepsInParallel({
      steps: [
        check({ label: 'broken', calls: brokenCalls, exitCode: 2 }),
        check({ label: 'later', calls: brokenCalls, exitCode: 3 }),
      ],
      concurrency: 2,
      start: failInParallel,
    });
    expect(broken).toBe(2);
    expect(brokenCalls).toEqual(['serial broken']);
  });

  it('stops at a failing writer before any check starts', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const started: string[] = [];
    const exitCode = await runStepsInParallel({
      steps: [
        { label: 'lint-staged', phase: 'write', run: () => 1 },
        check({ label: 'typecheck', calls: [] }),
      ],
      concurrency: 2,
      start: async (command) => {
        started.push(command.file);
        return passed;
      },
    });
    expect(exitCode).toBe(1);
    expect(started).toEqual([]);
  });

  it('falls back to the serial runner when the parallel runner throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const serial = vi.fn(() => 4);
    const exitCode = await runWithSerialFallback({
      parallel: () => Promise.reject(new Error('spawn EAGAIN')),
      serial,
    });
    expect(exitCode).toBe(4);
    expect(serial).toHaveBeenCalledTimes(1);
    expect(await runWithSerialFallback({ parallel: async () => 0, serial })).toBe(0);
    expect(serial).toHaveBeenCalledTimes(1);
  });
});
