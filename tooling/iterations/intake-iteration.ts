#!/usr/bin/env tsx
/**
 * pnpm iteration:intake — place a design drop into an iteration's intake-files/ and check it.
 *
 * Usage:
 *   pnpm iteration:intake <iteration> <source-folder> [--both] [--sibling <path>] [--replace] [--dry-run]
 *
 * Copies the drop flat into `iterations/<iteration>/intake-files/` (never README.md), checks the
 * required set (PRD.md, schema-routes.md; design-overview.md optional), warns on extras, and fills
 * the README's Drop placed, Drop source and Schema-routes rows. Refuses while Status is approved or
 * later. `--both` also copies PRD.md and schema-routes.md into the sibling repository's same-named
 * iteration. Exits non-zero when anything required is missing or a refusal applies.
 */
import { relative, resolve } from 'node:path';
import {
  applyIntake,
  type IntakePlan,
  type IntakeSide,
  parseIntakeArguments,
  planIntake,
} from './iteration-intake.util.js';
import { resolveSiblingRoot } from './iteration.util.js';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');

const USAGE = `Usage:
  pnpm iteration:intake <iteration> <source-folder> [--both] [--sibling <path>] [--replace] [--dry-run]

  --both            also copy PRD.md and schema-routes.md into the sibling repository's iteration
  --sibling <path>  sibling repository path (default: ../<package name with -be ↔ -fe>)
  --replace         overwrite files that differ (only while Status is planning)
  --dry-run         check and report only; write nothing`;

function describeSide(label: string, side: IntakeSide): string[] {
  const parent = resolve(REPOSITORY_ROOT, '..');
  return [
    `${label} (Status ${side.status}${side.locked ? ', intake locked' : ''}):`,
    ...side.files.map((file) => `  ${file.action.padEnd(9)} ${relative(parent, file.to)}`),
    ...(side.readme === undefined
      ? []
      : ['  README rows: Drop placed, Drop source, Schema-routes']),
  ];
}

function describePlan(plan: IntakePlan): string[] {
  return [
    `Iteration: ${plan.iteration}`,
    `Source:    ${plan.source}`,
    ...describeSide('This repository', plan.local),
    ...(plan.sibling === undefined ? [] : describeSide('Sibling repository', plan.sibling)),
    ...(plan.extras.length > 0
      ? [`Warning — extra files (not in the required or optional set): ${plan.extras.join(', ')}`]
      : []),
    ...plan.skipped.map((entry) => `Skipped: ${entry}`),
    ...(plan.missing.length === 0 ? ['Required set: complete'] : []),
  ];
}

function main(): void {
  const options = parseIntakeArguments(process.argv.slice(2));
  if (options.help || options.iteration === undefined) {
    console.log(USAGE);
    process.exit(options.help ? 0 : 1);
  }
  const plan = planIntake({
    repositoryRoot: REPOSITORY_ROOT,
    iteration: options.iteration,
    source: options.source === undefined ? undefined : resolve(process.cwd(), options.source),
    siblingRoot: options.createInSibling
      ? resolveSiblingRoot({ repositoryRoot: REPOSITORY_ROOT, siblingPath: options.siblingPath })
      : undefined,
    replace: options.replace,
  });
  const report = [options.dryRun ? 'Dry run — nothing written.' : '', ...describePlan(plan)].filter(
    (line) => line !== '',
  );
  console.log(report.join('\n'));
  if (plan.diffs.length > 0) console.log(`\n${plan.diffs.join('\n\n')}`);
  if (plan.problems.length > 0) {
    console.error(`\n✗ ${plan.problems.join('\n✗ ')}`);
    process.exit(1);
  }
  if (!options.dryRun) {
    applyIntake(plan);
    console.log('\nWritten.');
  }
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
