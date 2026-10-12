#!/usr/bin/env tsx
import '@/shared/config/load-env-files.js';

/**
 * pnpm iteration:frontend-map — regenerate an iteration's frontend route map
 * (`plans/frontend-route-map.md`, section 3: every available route).
 *
 * Usage:
 *   pnpm iteration:frontend-map <iteration>           # rewrite the generated block
 *   pnpm iteration:frontend-map <iteration> --check   # fail when the block is stale; write nothing
 *
 * The block comes from `docs/routes.txt` (run `pnpm routes:catalog` first when routes changed), the
 * OpenAPI document built in memory and the iteration's `plans/routes-final.md`. The hand-written
 * sections stay as they are; a missing map starts from `tooling/iterations/templates/`. A frozen
 * iteration is refused.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { buildOpenApiDocument } from '@tooling/openapi/emitters/openapi-document.js';
import { loadOpenApiStrings } from '@tooling/openapi/extractors/locale-loader.js';
import {
  openApiSummaries,
  parseFrontendMapArguments,
  parseRouteCatalog,
  parseRouteReviewNumbers,
  planFrontendRouteMap,
  readRouteReview,
  renderRouteSection,
} from './iteration-frontend-map.util.js';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');

const USAGE = `Usage:
  pnpm iteration:frontend-map <iteration> [--check]`;

function main(): void {
  const commandLine = process.argv.slice(2);
  if (commandLine.includes('--help') || commandLine.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const { iteration, isCheck } = parseFrontendMapArguments(commandLine);
  const routes = parseRouteCatalog(
    readFileSync(resolve(REPOSITORY_ROOT, 'docs/routes.txt'), 'utf-8'),
  );
  const block = renderRouteSection({
    routes,
    summaries: openApiSummaries(buildOpenApiDocument(loadOpenApiStrings('en'))),
    reviewNumbers: parseRouteReviewNumbers(
      readRouteReview({ repositoryRoot: REPOSITORY_ROOT, iteration }),
    ),
  });
  const plan = planFrontendRouteMap({ repositoryRoot: REPOSITORY_ROOT, iteration, block, isCheck });
  const shown = relative(REPOSITORY_ROOT, plan.path);
  if (isCheck) {
    if (plan.isChanged) {
      console.error(`✗ ${shown} is stale — run pnpm iteration:frontend-map ${iteration}`);
      process.exit(1);
    }
    console.log(`✓ ${shown} matches the routes (${routes.length}).`);
    return;
  }
  if (!plan.isChanged) {
    console.log(`${shown} is up to date (${routes.length} routes).`);
    return;
  }
  writeFileSync(plan.path, plan.content);
  console.log(
    `${plan.isNew ? 'Created' : 'Updated'} ${shown} (${routes.length} routes)${plan.isNew ? ' — write sections 1, 2 and 4' : ''}.`,
  );
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
