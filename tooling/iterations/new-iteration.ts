#!/usr/bin/env tsx
/**
 * pnpm iteration:new — open a design-iteration folder.
 *
 * Usage:
 *   pnpm iteration:new launch
 *   pnpm iteration:new <feat|change|fix> <topic> [--both] [--sibling <path>] [--dry-run]
 *
 * Creates `iterations/<type>-<topic>-<YYYY-MM-DD>-<id>/` with README.md (Owner, Opened, Branch,
 * Baseline, Status filled in), PRD.md, schema-routes.md and plans/product-plan.md. `--both` also
 * creates the same folder in clinozy-fe (README.md, PRD.md, schema-routes.md). The model:
 * iterations/README.md.
 */
import { relative, resolve } from 'node:path';
import { resolveGitMetadata } from '@tooling/setup/codegen/project-identity.util.js';
import { loadConfig } from '@tooling/setup/common/config.js';
import {
  type NewIterationPlan,
  parseNewIterationArguments,
  planNewIteration,
  resolveSiblingRoot,
  writeIterationPlan,
} from './iteration.util.js';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');

const USAGE = `Usage:
  pnpm iteration:new launch
  pnpm iteration:new <feat|change|fix> <topic> [--both] [--sibling <path>] [--dry-run]

  --both            also create the folder in the sibling repository (clinozy-fe)
  --sibling <path>  sibling repository path (default: ../<package name with -be → -fe>)
  --dry-run         print what would be created; write nothing`;

function describePlan(described: {
  readonly plan: NewIterationPlan;
  readonly baseBranch: string;
}): string[] {
  const { plan, baseBranch } = described;
  const baselineNote = plan.baselineOnBaseBranch ? '' : ` (not on ${baseBranch} yet)`;
  return [
    `Iteration: ${plan.name}`,
    `Baseline:  ${plan.fields.baseline}${baselineNote}`,
    `Owner:     ${plan.fields.owner} · Branch: ${plan.fields.branch} · Opened: ${plan.fields.opened}`,
    'Files:',
    ...plan.files.map((file) => `  ${relative(resolve(REPOSITORY_ROOT, '..'), file.path)}`),
  ];
}

function nextSteps(plan: NewIterationPlan): string[] {
  const folder = `iterations/${plan.name}`;
  return [
    'Next:',
    `  1. Write the Summary line in ${folder}/README.md.`,
    `  2. Write ${folder}/PRD.md — only the changed screens, flows and data.`,
    `  3. Generate schema-routes.md from clinozy-fe's docs/design-workflow/prompts/schema-routes-prompt.md (SCOPE = the changed screens) and copy it into ${folder}/ in both repositories.`,
    `  4. Write ${folder}/plans/product-plan.md, then one plans/<table>.md per new or changed table.`,
    '  5. Build each table with docs/getting-started/staged-build-prompt.md.',
    ...(plan.siblingFolder === undefined
      ? []
      : [`  6. Work in clinozy-fe on the same branch (${plan.fields.branch}).`]),
  ];
}

function main(): void {
  const options = parseNewIterationArguments(process.argv.slice(2));
  if (options.help || options.type === undefined) {
    console.log(USAGE);
    process.exit(options.help ? 0 : 1);
  }
  const baseBranch = resolveGitMetadata(loadConfig()).defaultBranch;
  const plan = planNewIteration({
    repositoryRoot: REPOSITORY_ROOT,
    baseBranch,
    type: options.type,
    topic: options.topic,
    siblingRoot: options.createInSibling
      ? resolveSiblingRoot({ repositoryRoot: REPOSITORY_ROOT, siblingPath: options.siblingPath })
      : undefined,
  });
  if (options.dryRun) {
    console.log(['Dry run — nothing written.', ...describePlan({ plan, baseBranch })].join('\n'));
    return;
  }
  writeIterationPlan(plan);
  console.log(
    ['Created.', ...describePlan({ plan, baseBranch }), '', ...nextSteps(plan)].join('\n'),
  );
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
