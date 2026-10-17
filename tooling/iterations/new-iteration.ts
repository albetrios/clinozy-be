#!/usr/bin/env tsx
/**
 * pnpm iteration:new — open a design-iteration folder.
 *
 * Usage:
 *   pnpm iteration:new launch
 *   pnpm iteration:new <feat|change|fix> <topic> [--both] [--sibling <path>] [--dry-run]
 *   pnpm iteration:new fix <topic> --lite
 *
 * Creates `iterations/<type>-<topic>-<YYYY-MM-DD>-<id>/README.md` (Owner, Opened, Branch, the
 * suggested Baseline, Process and Status planning filled in). `--lite` (a fix only) records Process
 * lite: planned in one step, then planning → implementing → done → frozen. `--both` also creates the same folder in the
 * sibling repository, with its own suggested Baseline. The drop goes in next with
 * `pnpm iteration:intake`. The model: iterations/README.md.
 */
import { relative, resolve } from 'node:path';
import { resolveGitMetadata } from '@tooling/setup/codegen/project-identity.util.js';
import { loadConfig } from '@tooling/setup/common/config.js';
import {
  EMPTY_FIELD,
  NO_BASELINE,
  type NewIterationPlan,
  parseNewIterationArguments,
  planNewIteration,
  resolveSiblingRoot,
  writePlannedFiles,
} from './iteration.util.js';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');

const USAGE = `Usage:
  pnpm iteration:new launch
  pnpm iteration:new <feat|change|fix> <topic> [--both] [--sibling <path>] [--lite] [--dry-run]

  --both            also create the folder in the sibling repository
  --lite            a fix planned in one step: planning → implementing → done → frozen
  --sibling <path>  sibling repository path (default: ../<package name with -be ↔ -fe>)
  --dry-run         print what would be created; write nothing`;

function baselineNote(baseline: string): string {
  if (baseline === NO_BASELINE) return 'none (initial)';
  if (baseline === EMPTY_FIELD)
    return '— (nothing done or frozen yet — confirm at planning Step 0)';
  return `${baseline} (suggested — confirm at planning Step 0)`;
}

function describePlan(plan: NewIterationPlan): string[] {
  return [
    `Iteration: ${plan.name}`,
    `Baseline:  ${baselineNote(plan.fields.baseline)}`,
    ...(plan.siblingBaseline === undefined
      ? []
      : [`Sibling Baseline: ${baselineNote(plan.siblingBaseline)}`]),
    `Owner:     ${plan.fields.owner} · Branch: ${plan.fields.branch} · Opened: ${plan.fields.opened} · Process: ${plan.fields.process}`,
    'Files:',
    ...plan.files.map((file) => `  ${relative(resolve(REPOSITORY_ROOT, '..'), file.path)}`),
  ];
}

function nextSteps(plan: NewIterationPlan): string[] {
  const folder = `iterations/${plan.name}`;
  if (plan.fields.process === 'lite') {
    return [
      'Next (a lite fix):',
      `  1. Write the Summary line in ${folder}/README.md.`,
      `  2. Plan it in one step: "plan iteration ${plan.name}" (be-iteration-planning, lite: KICKOFF.md, plans/decisions.md and plans/acceptance.md, one stop for the user's go).`,
      `  3. On the go: pnpm iteration:status ${plan.name} implementing, then "kickoff iteration ${plan.name}".`,
      '  The steps in full: docs/design-workflow/process/iteration-guide.md',
    ];
  }
  return [
    'Next:',
    `  1. Write the Summary line in ${folder}/README.md.`,
    `  2. Place the drop: pnpm iteration:intake ${plan.name} <source>${plan.siblingFolder === undefined ? '' : ' --both'}`,
    ...(plan.fields.type === 'launch'
      ? []
      : [
          `     Only the changed files: --mode overlay · only a BRIEF.md (template: tooling/iterations/templates/BRIEF.md): --mode brief — both build on the README's Baseline (${plan.fields.baseline}); for another one, first: pnpm iteration:baseline ${plan.name} <baseline>`,
        ]),
    `  3. Plan it: "plan iteration ${plan.name}" (be-iteration-planning runs the gate, confirms the Baseline and writes KICKOFF.md + plans/).`,
    `  4. Implement it: "kickoff iteration ${plan.name}" (be-kickoff-iteration — one ledger row at a time, AS-BUILT.md).`,
    '  The steps in full: docs/design-workflow/process/iteration-guide.md',
  ];
}

function main(): void {
  const options = parseNewIterationArguments(process.argv.slice(2));
  if (options.help || options.type === undefined) {
    console.log(USAGE);
    process.exit(options.help ? 0 : 1);
  }
  const plan = planNewIteration({
    repositoryRoot: REPOSITORY_ROOT,
    baseBranch: resolveGitMetadata(loadConfig()).defaultBranch,
    type: options.type,
    topic: options.topic,
    lite: options.lite,
    siblingRoot: options.createInSibling
      ? resolveSiblingRoot({ repositoryRoot: REPOSITORY_ROOT, siblingPath: options.siblingPath })
      : undefined,
  });
  if (options.dryRun) {
    console.log(['Dry run — nothing written.', ...describePlan(plan)].join('\n'));
    return;
  }
  writePlannedFiles(plan.files);
  console.log(['Created.', ...describePlan(plan), '', ...nextSteps(plan)].join('\n'));
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
