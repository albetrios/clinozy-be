#!/usr/bin/env tsx
/**
 * `pnpm guard:pre-push` — the whole of `.husky/pre-push`: the steps of
 * `tooling/validate/pre-push-steps.ts` for the commits the push carries, measured from one base
 * (`resolveBase`: the upstream, else `origin/<trunk>`), one after another; the first failure stops
 * the push. `pnpm test:affected` previews the same list.
 */
import { spawnSync } from 'node:child_process';
import { git, resolveBase, trunkBranch } from '@tooling/setup/common/git-environment.js';
import { isMain, parseCommandLine } from '@tooling/setup/common/script.js';
import { branchNameProblem, prePushSteps } from '@tooling/validate/pre-push-steps.js';

function main(): number {
  const base = resolveBase();
  const changedFiles = git({ args: ['diff', '--name-only', '--no-renames', `${base}...HEAD`] })
    .split('\n')
    .filter(Boolean);
  const steps = prePushSteps({ changedFiles, base });
  console.log(`pre-push: ${changedFiles.length} file(s) since ${base}`);
  for (const [index, step] of steps.entries()) {
    const position = `${index + 1}/${steps.length}`;
    if (!step.runs) {
      console.log(`○ Step ${position}: ${step.label} — skipped (${step.why})`);
      continue;
    }
    console.log(`▶ Step ${position}: ${step.label}`);
    if (step.pnpmArguments.length === 0) {
      // The branch-name policy, in-process.
      if (process.env.SKIP_BRANCH_CHECK === '1') {
        console.log('Skipping branch-name policy on pre-push.');
        continue;
      }
      const problem = branchNameProblem({
        branch: git({ args: ['rev-parse', '--abbrev-ref', 'HEAD'] }),
        trunk: trunkBranch(),
      });
      if (problem) {
        console.error(problem);
        return 1;
      }
      continue;
    }
    const status = spawnSync('pnpm', [...step.pnpmArguments], { stdio: 'inherit' }).status ?? 1;
    if (status !== 0) {
      console.error(`✗ FAILED at step ${position}: ${step.label} (exit ${status})`);
      return status;
    }
  }
  return 0;
}

if (isMain(import.meta.url)) {
  parseCommandLine({ args: process.argv.slice(2) });
  process.exitCode = main();
}
