import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const strykerConfigPath = join(process.cwd(), 'stryker.config.json');
const workflowPath = join(process.cwd(), '.github/workflows/scheduled-stryker-mutation.yml');
const vitestStrykerPath = join(process.cwd(), 'tooling/vitest/stryker.config.ts');

describe('Stryker mutation testing policy (#68)', () => {
  it('enforces 70% break threshold on auth, billing, tenancy, and security middleware', () => {
    const config = JSON.parse(readFileSync(strykerConfigPath, 'utf8')) as {
      mutate: string[];
      thresholds: { break: number; high: number };
      testRunner: string;
    };

    expect(config.testRunner).toBe('vitest');
    expect(config.thresholds.break).toBe(70);
    expect(config.thresholds.high).toBe(80);
    expect(config.mutate.some((pattern) => pattern.includes('domains/auth'))).toBe(true);
    expect(config.mutate.some((pattern) => pattern.includes('domains/billing'))).toBe(true);
    expect(config.mutate.some((pattern) => pattern.includes('domains/tenancy'))).toBe(true);
    expect(
      config.mutate.some((pattern) => pattern.includes('middlewares/core/auth.middleware.ts')),
    ).toBe(true);
    expect(
      config.mutate.some((pattern) =>
        pattern.includes('middlewares/security/api-key-auth.middleware.ts'),
      ),
    ).toBe(true);
  });

  it('wires nightly workflow with artifact upload', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('pnpm test:mutation');
    expect(workflow).toContain('mutation-report.json');
    expect(workflow).toContain("cron: '30 3 * * 0'");
  });

  it('stubs the Sentry CPU profiler, whose native addon segfaults the threads pool', async () => {
    const vitestConfig = readFileSync(vitestStrykerPath, 'utf8');
    expect(vitestConfig).toMatch(
      /'@sentry\/profiling-node':\s*resolve\([^)]*'sentry-profiling-node\.stub\.ts'\)/,
    );
    // The stub keeps the one export sentry.ts imports, as a no-op integration.
    const { nodeProfilingIntegration } = await import(
      '@tooling/vitest/sentry-profiling-node.stub.js'
    );
    expect(nodeProfilingIntegration()).toEqual({ name: 'ProfilingIntegration' });
  });

  it('patches the vitest runner so each mutant selects its covering tests', () => {
    // Vitest 5 matches testNamePattern against names joined with " > "; the runner's test ids join
    // them with spaces, so unpatched, every mutant ran zero tests and "survived".
    const workspace = readFileSync(join(process.cwd(), 'pnpm-workspace.yaml'), 'utf8');
    const registration = workspace.match(
      /'@stryker-mutator\/vitest-runner@[\d.]+': (patches\/\S+\.patch)/,
    );
    expect(registration, 'the runner patch is registered in pnpm-workspace.yaml').not.toBeNull();
    const patch = readFileSync(join(process.cwd(), registration![1]!), 'utf8');
    expect(patch).toContain(".replaceAll(' ', '(?: | > )')");
  });

  it('limits vitest to service and middleware unit tests for mutation dry run', () => {
    const vitestConfig = readFileSync(vitestStrykerPath, 'utf8');
    expect(vitestConfig).toContain('*service*.unit.test.ts');
    expect(vitestConfig).toContain('src/tests/unit/middleware');
    expect(vitestConfig).not.toContain('src/domains/auth/**/*.unit.test.ts');
  });
});
