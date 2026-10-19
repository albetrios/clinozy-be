import { describe, expect, it, vi } from 'vitest';
import {
  buildRunnableSteps,
  findOversizedStagedFiles,
  hasPackageScript,
  shouldRunGlobalTests,
  shouldRunLockfileAudit,
  shouldRunLockfileCheck,
  shouldRunMigrationCheck,
  shouldRunOpenApiCheck,
  shouldRunRlsPolicyLint,
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

  it('runs the RLS policy lint on migrations and schemas, the audit on a staged lockfile', () => {
    expect(shouldRunRlsPolicyLint(['migrations/20260531000001_test.sql'])).toBe(true);
    expect(shouldRunRlsPolicyLint(['src/domains/app/sub-domains/leads/leads.schema.ts'])).toBe(
      true,
    );
    expect(shouldRunRlsPolicyLint(['src/domains/app/sub-domains/leads/leads.service.ts'])).toBe(
      false,
    );
    expect(shouldRunLockfileAudit(['pnpm-lock.yaml'])).toBe(true);
    expect(shouldRunLockfileAudit(['package.json'])).toBe(false);
  });

  it('runs the early checks in-process, so their warnings reach the terminal', () => {
    const steps = buildRunnableSteps({ stagedFiles: [], scripts: baseScripts });
    for (const label of [
      'RLS policy lint',
      'Route access diff',
      'Dependency audit (lockfile staged)',
    ]) {
      const step = steps.find((candidate) => candidate.label === label);
      expect(step?.phase, label).toBe('check');
      expect(step && 'command' in step, label).toBe(false);
    }
  });

  it('detects dependency-manifest / lockfile staged paths', () => {
    expect(shouldRunLockfileCheck(['package.json'])).toBe(true);
    expect(shouldRunLockfileCheck(['pnpm-lock.yaml'])).toBe(true);
    expect(shouldRunLockfileCheck(['pnpm-workspace.yaml'])).toBe(true);
    // Nested/unrelated files do not trigger the frozen-install check.
    expect(shouldRunLockfileCheck(['tooling/setup/package.json'])).toBe(false);
    expect(shouldRunLockfileCheck(['src/domains/auth/auth.service.ts'])).toBe(false);
  });

  it('applies the lockfile step only when a manifest or the lockfile is staged', () => {
    const lockfileStep = (stagedFiles: string[]) =>
      buildRunnableSteps({ stagedFiles, scripts: baseScripts }).find(
        (step) => step.label === 'Lockfile in sync',
      );
    expect(lockfileStep(['package.json'])?.applies).toBe(true);
    expect(lockfileStep(['docs/README.md'])?.applies).toBe(false);
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

  it('leaves the SonarQube gate to pre-push (tooling/validate/pre-push-steps.ts)', () => {
    const labels = buildRunnableSteps({
      stagedFiles: ['src/domains/auth/auth.service.ts'],
      scripts: baseScripts,
    }).map((step) => step.label);
    expect(labels).not.toContain('SonarQube quality gate');
  });

  it('includes optional steps only when package scripts exist', () => {
    expect(hasPackageScript({ scripts: baseScripts, scriptName: 'validate:test-naming' })).toBe(
      true,
    );
    expect(
      hasPackageScript({ scripts: baseScripts, scriptName: 'tool:project-structure-tree:check' }),
    ).toBe(false);

    const labels = (steps: RunnableStep[]) => steps.map((step) => step.label);
    const stepsWithoutCheck = buildRunnableSteps({
      stagedFiles: ['src/domains/auth/auth.routes.ts'],
      scripts: baseScripts,
    });
    expect(labels(stepsWithoutCheck)).toContain('Test filename suffixes');
    expect(labels(stepsWithoutCheck)).not.toContain('Source tree drift check');

    const stepsWithCheck = buildRunnableSteps({
      stagedFiles: ['docs/README.md'],
      scripts: {
        ...baseScripts,
        'tool:project-structure-tree:check':
          'tsx src/scripts/codegen/generate-project-structure-tree.ts --check',
      },
    });
    expect(labels(stepsWithCheck)).toContain('Source tree drift check');
  });

  it('labels the large-file step with the 3MB limit and the iterations/ exemption', () => {
    const largeFileStep = buildRunnableSteps({ stagedFiles: [], scripts: baseScripts }).find(
      (step) => step.label.startsWith('Large staged files'),
    );
    expect(largeFileStep?.label).toBe('Large staged files (>3MB; iterations/ exempt)');
    expect(largeFileStep?.applies).toBe(true);
  });

  it('omits validate:test-naming when script is missing', () => {
    const steps = buildRunnableSteps({
      stagedFiles: [],
      scripts: { 'tool:project-structure-tree': 'tsx ...' },
    });
    expect(steps.some((step) => step.label === 'Test filename suffixes')).toBe(false);
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
      description: label,
      applies: true,
      phase: 'check',
      ...(lock === undefined ? {} : { lock }),
      run: () => {
        calls.push(`serial ${label}`);
        return exitCode;
      },
      command: options.command === undefined ? { file: label, args: [] } : options.command,
    };
  }

  it('describes every step it runs, so --list prints the one list', () => {
    const stagedFiles = ['src/domains/auth/auth.routes.ts', 'migrations/20260531000001_test.sql'];
    for (const step of buildRunnableSteps({ stagedFiles, scripts })) {
      expect(step.description.trim(), step.label).not.toBe('');
    }
  });

  it('scans the staged files with the same gitleaks flags as clinozy-fe', () => {
    const scan = buildRunnableSteps({ stagedFiles: [], scripts }).find(
      (step) => step.label === 'Staged secrets scan',
    );
    expect(scan?.command).toEqual({
      file: 'gitleaks',
      args: ['protect', '--staged', '--redact', '--verbose', '--config', '.gitleaks.toml'],
    });
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
        description: 'regenerate',
        applies: true,
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
        {
          label: 'lint-staged',
          description: 'lint-staged',
          applies: true,
          phase: 'write',
          run: () => 1,
        },
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
