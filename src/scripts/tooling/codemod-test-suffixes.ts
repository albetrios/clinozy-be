/**
 * One-shot codemod: rename test files to tier suffix convention and relocate events/__tests__/.
 * Usage: tsx src/scripts/tooling/codemod-test-suffixes.ts [--dry-run]
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const DRY_RUN = process.argv.includes('--dry-run');

type PlannedMove = { from: string; to: string };

const plannedMoves: PlannedMove[] = [];

function addMove({ fromPath, toPath }: { fromPath: string; toPath: string }): void {
  if (fromPath === toPath) return;
  if (!existsSync(fromPath)) return;
  plannedMoves.push({ from: fromPath, to: toPath });
}

function stripTestSuffix(fileName: string): string {
  return fileName.replace(/\.test\.ts$/, '').replace(/\.test\.tsx$/, '');
}

function addTierSuffix({ baseName, tier }: { baseName: string; tier: string }): string {
  if (baseName.endsWith(`.${tier}`)) return `${baseName}.test.ts`;
  return `${baseName}.${tier}.test.ts`;
}

function renameInDirectory({ directory, tier }: { directory: string; tier: string }): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      renameInDirectory({ directory: fullPath, tier });
      continue;
    }
    if (!(entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx'))) continue;
    if (entry.name.includes(`.${tier}.test.ts`)) continue;
    if (entry.name.endsWith('.chaos.test.ts')) continue;

    const base = stripTestSuffix(entry.name);
    const newName = addTierSuffix({ baseName: base, tier });
    addMove({ fromPath: fullPath, toPath: join(directory, newName) });
  }
}

function relocateEventsTests(): void {
  const domainsDir = join(ROOT, 'src/domains');
  if (!existsSync(domainsDir)) return;

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'events' && existsSync(join(fullPath, '__tests__'))) {
          const eventsTestsDir = join(fullPath, '__tests__');
          const ownerTestsDir = join(dirname(fullPath), '__tests__');
          const targetEventsDir = join(ownerTestsDir, 'unit', 'events');
          const targetWorkerDir = join(targetEventsDir, 'worker');

          for (const testFile of readdirSync(eventsTestsDir)) {
            // eslint-disable-next-line max-depth -- CLI codemod: nested directory walk.
            if (!testFile.endsWith('.test.ts')) continue;
            const from = join(eventsTestsDir, testFile);
            const base = stripTestSuffix(testFile);
            const isWorker = testFile.includes('worker') || base.includes('worker');
            const targetDir = isWorker ? targetWorkerDir : targetEventsDir;
            const newName = addTierSuffix({ baseName: base, tier: 'unit' });
            addMove({ fromPath: from, toPath: join(targetDir, newName) });
          }
          continue;
        }
        walk(fullPath);
      }
    }
  };

  walk(domainsDir);
}

function scanCrossCuttingTests(): void {
  renameInDirectory({ directory: join(ROOT, 'src/tests/unit'), tier: 'unit' });
  renameInDirectory({ directory: join(ROOT, 'src/tests/integration'), tier: 'integration' });
  renameInDirectory({ directory: join(ROOT, 'src/tests/security'), tier: 'security' });
  renameInDirectory({ directory: join(ROOT, 'src/tests/performance'), tier: 'performance' });
  renameInDirectory({ directory: join(ROOT, 'src/tests/contract'), tier: 'contract' });
  renameInDirectory({ directory: join(ROOT, 'src/tests/global'), tier: 'global' });

  const domainsDir = join(ROOT, 'src/domains');
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') {
          renameInDirectory({ directory: join(fullPath, 'unit'), tier: 'unit' });
          renameInDirectory({ directory: join(fullPath, 'integration'), tier: 'integration' });
          renameInDirectory({ directory: join(fullPath, 'e2e'), tier: 'e2e' });
          continue;
        }
        walk(fullPath);
      }
    }
  };
  if (existsSync(domainsDir)) walk(domainsDir);
}

function executeMoves(): void {
  for (const move of plannedMoves) {
    const targetDirectory = dirname(move.to);
    if (!existsSync(targetDirectory)) {
      if (DRY_RUN) {
        console.log(`mkdir ${targetDirectory}`);
      } else {
        execSync(`mkdir -p "${targetDirectory}"`);
      }
    }
    console.log(
      `${DRY_RUN ? '[dry-run] ' : ''}git mv ${relative(ROOT, move.from)} ${relative(ROOT, move.to)}`,
    );
    if (!DRY_RUN) {
      try {
        execSync(`git mv "${move.from}" "${move.to}"`, { stdio: 'inherit' });
      } catch {
        renameSync(move.from, move.to);
      }
    }
  }
}

function removeEmptyEventsTestDirs(): void {
  const domainsDir = join(ROOT, 'src/domains');
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name === 'events' && existsSync(join(fullPath, '__tests__'))) {
        const eventsTests = join(fullPath, '__tests__');
        const remaining = readdirSync(eventsTests);
        if (remaining.length === 0 && !DRY_RUN) {
          rmSync(eventsTests, { recursive: true, force: true });
        }
      }
      walk(fullPath);
    }
  };
  if (existsSync(domainsDir)) walk(domainsDir);
}

function main(): void {
  relocateEventsTests();
  scanCrossCuttingTests();
  console.log(`Planned ${plannedMoves.length} moves`);
  executeMoves();
  removeEmptyEventsTestDirs();
}

main();
