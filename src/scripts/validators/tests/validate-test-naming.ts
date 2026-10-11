/**
 * Ensures every *.test.ts uses a recognized tier suffix and lives in the matching folder.
 * Usage: pnpm validate:test-naming
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'src');

const TIER_SUFFIXES = [
  'unit',
  'integration',
  'e2e',
  'smoke',
  'chaos',
  'contract',
  'security',
  'performance',
  'global',
] as const;

type TierSuffix = (typeof TIER_SUFFIXES)[number];

/** Returns whether a test file is exempt from the `*.tier.test.ts` filename convention. */
export function isExemptFromTierSuffix(relativePath: string): boolean {
  const normalized = relativePath.replaceAll('\\', '/');

  // Bundled domain e2e: domains/<d>/__tests__/<d>.test.ts
  const bundledDomainMatch = normalized.match(/^domains\/([^/]+)\/__tests__\/\1\.test\.ts$/);
  if (bundledDomainMatch) return true;

  // Sub-domain __tests__/*.test.ts route suites (excluding forbidden events/__tests__)
  if (
    normalized.match(/^domains\/.*\/__tests__\/[^/]+\.test\.ts$/) &&
    !normalized.includes('/events/__tests__/')
  ) {
    return true;
  }

  return false;
}

/** Parses the Vitest tier suffix from a test filename, if present. */
export function detectTier(fileName: string): TierSuffix | undefined {
  if (fileName.endsWith('.db.unit.test.ts')) return 'unit';
  for (const tier of TIER_SUFFIXES) {
    if (fileName.endsWith(`.${tier}.test.ts`)) return tier;
  }
  return undefined;
}

/**
 * Returns whether a test file path is allowed for the given Vitest tier suffix.
 *
 * @remarks
 * The allowed folders mirror the Vitest projects' `include` globs (`tooling/vitest/projects.ts`):
 * a file outside them is collected by no project and never runs. Seven unit suites — the mail
 * worker, DLQ auto-retry worker, Sentry and OpenTelemetry among them — sat in a `__tests__/`
 * folder without `unit/` because `infrastructure/` and `scripts/` were allowed anywhere. A
 * `*.db.unit` or `*.property.unit` file is collected anywhere under `src/` by its own project.
 */
export function isPathAllowedForTier({
  relativePath,
  tier,
}: {
  relativePath: string;
  tier: TierSuffix;
}): boolean {
  const normalized = relativePath.replaceAll('\\', '/');
  switch (tier) {
    case 'unit':
      return (
        normalized.endsWith('.db.unit.test.ts') ||
        normalized.endsWith('.property.unit.test.ts') ||
        normalized.includes('/__tests__/unit/') ||
        normalized.startsWith('tests/unit/')
      );
    case 'integration':
      return (
        normalized.includes('/__tests__/integration/') ||
        normalized.startsWith('tests/integration/')
      );
    case 'e2e':
      return normalized.includes('/__tests__/e2e/') || normalized.startsWith('tests/e2e/');
    case 'smoke':
      return normalized.startsWith('tests/smoke/');
    case 'security':
      return normalized.startsWith('tests/security/');
    case 'performance':
      return normalized.startsWith('tests/performance/');
    case 'contract':
      return normalized.startsWith('tests/contract/');
    case 'chaos':
      return normalized.startsWith('tests/chaos/');
    case 'global':
      return normalized.startsWith('tests/global/');
    default:
      return false;
  }
}

function walk({ directory, collector }: { directory: string; collector: string[] }): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk({ directory: fullPath, collector });
      continue;
    }
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) {
      collector.push(fullPath);
    }
  }
}

function main(): void {
  const errors: string[] = [];
  const testFiles: string[] = [];
  walk({ directory: ROOT, collector: testFiles });

  for (const filePath of testFiles) {
    const fileName = filePath.split('/').pop() ?? filePath;
    const tier = detectTier(fileName);
    const relativePath = relative(ROOT, filePath);

    if (!tier) {
      if (isExemptFromTierSuffix(relativePath)) continue;
      errors.push(`Missing tier suffix in filename: ${relativePath}`);
      continue;
    }

    if (!isPathAllowedForTier({ relativePath, tier })) {
      errors.push(`*.${tier}.test.ts in wrong folder: ${relativePath}`);
    }
  }

  const domainsDir = join(ROOT, 'domains');
  const findForbiddenEventsTests = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'events' && existsSync(join(fullPath, '__tests__'))) {
          errors.push(
            `Forbidden events/__tests__/ — use __tests__/unit/events/: ${relative(ROOT, join(fullPath, '__tests__'))}`,
          );
        }
        findForbiddenEventsTests(fullPath);
      }
    }
  };
  if (existsSync(domainsDir)) findForbiddenEventsTests(domainsDir);

  if (errors.length > 0) {
    console.error('validate-test-naming failed:\n');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  console.log(`✅ validate-test-naming passed (${testFiles.length} test files)`);
}

main();
