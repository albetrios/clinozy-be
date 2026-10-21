#!/usr/bin/env node
/**
 * Merges multiple istanbul-format `coverage-final.json` files (produced by
 * `@vitest/coverage-v8` with the `json` reporter) into a single coverage map,
 * computes a coverage summary across lines/statements/functions/branches, and
 * enforces minimum thresholds — exiting non-zero if any threshold is missed.
 *
 * Usage:
 *   node tooling/ci/merge-coverage-and-check-thresholds.mjs \
 *     coverage-fast/coverage-final.json \
 *     coverage-db-bound/coverage-final.json \
 *     [--output coverage-merged/coverage-final.json] \
 *     [--lines 80] [--branches 70] [--statements 80] [--functions 80] \
 *     [--report-only]
 *
 * Vitest applies coverage thresholds *per process*, so when CI splits tests
 * across matrix shards each shard fails the global threshold even when the
 * union of shards exceeds it. Disable thresholds per shard
 * (`--coverage.thresholds.*=0`) and gate the merged report with this script.
 *
 * `--report-only` prints the summary and threshold comparison without exiting
 * non-zero on misses. Used by CI in smart mode, where only tests touched by
 * the PR diff run and the merged report cannot meet a full-matrix threshold.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { parseCommandLine } from '../setup/common/script.ts';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
/**
 * Single source of truth for coverage thresholds — also consumed by
 * `vitest.config.ts` so local `pnpm test:coverage` and the CI merged gate
 * enforce the same numbers.
 */
const sharedThresholdsPath = resolve(scriptDirectory, 'coverage-thresholds.json');
const DEFAULT_THRESHOLDS = JSON.parse(readFileSync(sharedThresholdsPath, 'utf8'));

const THRESHOLD_KEYS = ['lines', 'branches', 'statements', 'functions'];

function parseArguments(argv) {
  // An empty token (an unset shell variable passed quoted) is skipped, as before.
  const { values, positionals: inputs } = parseCommandLine({
    args: argv.filter((token) => token !== ''),
    options: {
      output: { type: 'string', short: 'o' },
      'report-only': { type: 'boolean' },
      ...Object.fromEntries(THRESHOLD_KEYS.map((key) => [key, { type: 'string' }])),
    },
    maxPositionals: Number.POSITIVE_INFINITY,
    messages: { unknownOption: (option) => `Unknown flag: ${option}` },
  });
  const thresholds = { ...DEFAULT_THRESHOLDS };
  for (const key of THRESHOLD_KEYS) {
    if (values[key] !== undefined) thresholds[key] = Number(values[key]);
  }
  const outputPath = values.output ?? null;
  const reportOnly = values['report-only'] === true;
  if (inputs.length === 0) {
    throw new Error('No coverage inputs provided. Pass one or more `coverage-final.json` paths.');
  }
  return { inputs, thresholds, outputPath, reportOnly };
}

function mergeFileCoverage(target, source) {
  for (const statementId of Object.keys(source.s)) {
    target.s[statementId] = (target.s[statementId] ?? 0) + source.s[statementId];
  }
  for (const functionId of Object.keys(source.f)) {
    target.f[functionId] = (target.f[functionId] ?? 0) + source.f[functionId];
  }
  for (const branchId of Object.keys(source.b)) {
    if (!target.b[branchId]) {
      target.b[branchId] = source.b[branchId].slice();
      continue;
    }
    for (let branchIndex = 0; branchIndex < source.b[branchId].length; branchIndex += 1) {
      target.b[branchId][branchIndex] =
        (target.b[branchId][branchIndex] ?? 0) + (source.b[branchId][branchIndex] ?? 0);
    }
  }
}

function loadCoverage(inputPath) {
  const absolutePath = resolve(process.cwd(), inputPath);
  const raw = readFileSync(absolutePath, 'utf8');
  return JSON.parse(raw);
}

function tallyHitMap(hitMap) {
  let total = 0;
  let covered = 0;
  for (const id of Object.keys(hitMap)) {
    total += 1;
    if (hitMap[id] > 0) covered += 1;
  }
  return { total, covered };
}

function tallyBranchMap(branchMap) {
  let total = 0;
  let covered = 0;
  for (const branchId of Object.keys(branchMap)) {
    for (const hits of branchMap[branchId]) {
      total += 1;
      if (hits > 0) covered += 1;
    }
  }
  return { total, covered };
}

/**
 * Line coverage is derived from statementMap: each line is covered if any
 * statement starting on that line was executed at least once. Mirrors the
 * istanbul-lib-coverage `FileCoverage.toSummary()` heuristic.
 */
function tallyLineCoverage(fileCoverage) {
  const lineHits = new Map();
  for (const statementId of Object.keys(fileCoverage.statementMap)) {
    const lineNumber = fileCoverage.statementMap[statementId].start.line;
    const previousHits = lineHits.get(lineNumber) ?? 0;
    const statementHits = fileCoverage.s[statementId] ?? 0;
    lineHits.set(lineNumber, Math.max(previousHits, statementHits));
  }
  let total = 0;
  let covered = 0;
  for (const hits of lineHits.values()) {
    total += 1;
    if (hits > 0) covered += 1;
  }
  return { total, covered };
}

function computeSummary(merged) {
  const totals = {
    statements: { total: 0, covered: 0 },
    functions: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 },
    lines: { total: 0, covered: 0 },
  };

  for (const filePath of Object.keys(merged)) {
    const fileCoverage = merged[filePath];
    const statementCounts = tallyHitMap(fileCoverage.s);
    const functionCounts = tallyHitMap(fileCoverage.f);
    const branchCounts = tallyBranchMap(fileCoverage.b);
    const lineCounts = tallyLineCoverage(fileCoverage);

    totals.statements.total += statementCounts.total;
    totals.statements.covered += statementCounts.covered;
    totals.functions.total += functionCounts.total;
    totals.functions.covered += functionCounts.covered;
    totals.branches.total += branchCounts.total;
    totals.branches.covered += branchCounts.covered;
    totals.lines.total += lineCounts.total;
    totals.lines.covered += lineCounts.covered;
  }

  const { statements, functions, branches, lines } = totals;
  const percentage = (covered, total) => (total === 0 ? 100 : (covered / total) * 100);

  return {
    lines: {
      covered: lines.covered,
      total: lines.total,
      pct: percentage(lines.covered, lines.total),
    },
    statements: {
      covered: statements.covered,
      total: statements.total,
      pct: percentage(statements.covered, statements.total),
    },
    functions: {
      covered: functions.covered,
      total: functions.total,
      pct: percentage(functions.covered, functions.total),
    },
    branches: {
      covered: branches.covered,
      total: branches.total,
      pct: percentage(branches.covered, branches.total),
    },
  };
}

function main() {
  const { inputs, thresholds, outputPath, reportOnly } = parseArguments(process.argv.slice(2));

  const merged = {};
  for (const inputPath of inputs) {
    const coverage = loadCoverage(inputPath);
    for (const filePath of Object.keys(coverage)) {
      if (!merged[filePath]) {
        merged[filePath] = JSON.parse(JSON.stringify(coverage[filePath]));
        continue;
      }
      mergeFileCoverage(merged[filePath], coverage[filePath]);
    }
    console.log(`Loaded ${Object.keys(coverage).length} files from ${inputPath}`);
  }
  console.log(`Merged total: ${Object.keys(merged).length} unique files`);

  if (outputPath) {
    const absoluteOutputPath = resolve(process.cwd(), outputPath);
    mkdirSync(dirname(absoluteOutputPath), { recursive: true });
    writeFileSync(absoluteOutputPath, JSON.stringify(merged));
    console.log(`Wrote merged coverage to ${absoluteOutputPath}`);
  }

  const summary = computeSummary(merged);

  console.log('\nMerged coverage summary:');
  for (const metric of ['lines', 'statements', 'functions', 'branches']) {
    const entry = summary[metric];
    console.log(
      `  ${metric.padEnd(11)}: ${entry.pct.toFixed(2).padStart(6)}% (${entry.covered}/${entry.total})`,
    );
  }

  console.log('\nThreshold check:');
  let failed = false;
  for (const metric of ['lines', 'branches', 'statements', 'functions']) {
    const actual = summary[metric].pct;
    const required = thresholds[metric];
    const status = actual >= required ? 'OK' : 'FAIL';
    console.log(
      `  ${metric.padEnd(11)}: ${actual.toFixed(2).padStart(6)}% (threshold ${required}%) [${status}]`,
    );
    if (actual < required) failed = true;
  }

  if (failed) {
    if (reportOnly) {
      console.warn(
        '\nCoverage thresholds not met across merged shards (report-only mode — not failing).',
      );
      return;
    }
    console.error('\nCoverage thresholds not met across merged shards.');
    process.exit(1);
  }

  console.log('\nAll thresholds met across merged shards.');
}

try {
  main();
} catch (error) {
  console.error(`merge-coverage-and-check-thresholds: ${error.message}`);
  process.exit(2);
}
