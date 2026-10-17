/**
 * Route access diff — an early check at commit: what a change does to who may call each route,
 * read from `docs/routes.txt` (the staged catalog against HEAD's).
 *
 * Usage:
 *   pnpm routes:access-diff                    # staged catalog vs HEAD (the pre-commit step)
 *   pnpm routes:access-diff --base origin/main # working-tree catalog vs a ref
 *
 * Every added, removed or changed route is listed; a change that widens access is a finding: a
 * new route without a JWT (PUBLIC or TOKEN), a weaker gate (PERM / ROLE → AUTH → TOKEN / PUBLIC),
 * a changed permission or role, team-only → both, a write that no longer requires
 * `X-Idempotency-Key`. A finding that is meant states its reason —
 * `ROUTE_ACCESS_CHANGE_REASON="<why>" git commit` — and passes. Warn-only until
 * `EARLY_CHECKS_BLOCK_FROM` (`src/scripts/tooling/early-checks.util.ts`).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportEarlyCheck } from '@/scripts/tooling/early-checks.util.js';
import {
  type CatalogRoute,
  parseRouteCatalog,
} from '@tooling/iterations/iteration-frontend-map.util.js';

const ROUTES_CATALOG = 'docs/routes.txt';

/** What changed between two catalogs: every line to print, and the ones that widen access. */
export interface RouteAccessDiff {
  changes: string[];
  findings: string[];
}

/** PUBLIC 0 · TOKEN 1 · AUTH 2 · ROLE / PERM 3 — a lower rank lets more callers in. */
function gateRank(gate: string): number {
  if (gate.startsWith('PERM') || gate.startsWith('ROLE')) return 3;
  if (gate.startsWith('AUTH')) return 2;
  if (gate.startsWith('TOKEN')) return 1;
  return 0;
}

function describe(route: CatalogRoute): string {
  const scope = route.isTeamOnly ? 'team-only' : 'both';
  const idempotency = route.isIdempotencyRequired ? 'idempotency req' : 'no idempotency';
  return `${route.gate} · ${scope} · ${idempotency}`;
}

/**
 * Compares two route catalogs (the `docs/routes.txt` text) and lists every access change.
 *
 * @remarks
 * Routes are matched by `METHOD path`; a renamed path reads as one removed and one added route.
 */
export function diffRouteAccess(options: { before: string; after: string }): RouteAccessDiff {
  const key = (route: CatalogRoute) => `${route.method} ${route.path}`;
  const before = new Map(parseRouteCatalog(options.before).map((route) => [key(route), route]));
  const after = new Map(parseRouteCatalog(options.after).map((route) => [key(route), route]));
  const changes: string[] = [];
  const findings: string[] = [];

  for (const [name, route] of after) {
    const previous = before.get(name);
    if (!previous) {
      changes.push(`+ ${name} — ${describe(route)}`);
      if (gateRank(route.gate) < 2)
        findings.push(`${name}: new route without a JWT (${route.gate})`);
      continue;
    }
    if (describe(previous) === describe(route)) continue;
    changes.push(`~ ${name} — ${describe(previous)} → ${describe(route)}`);
    if (gateRank(route.gate) < gateRank(previous.gate)) {
      findings.push(`${name}: weaker gate (${previous.gate} → ${route.gate})`);
    } else if (route.gate !== previous.gate && gateRank(previous.gate) === 3) {
      findings.push(`${name}: permission changed (${previous.gate} → ${route.gate})`);
    }
    if (previous.isTeamOnly && !route.isTeamOnly) {
      findings.push(`${name}: team-only → both (personal accounts may call it now)`);
    }
    if (previous.isIdempotencyRequired && !route.isIdempotencyRequired) {
      findings.push(`${name}: no longer requires X-Idempotency-Key`);
    }
  }
  for (const [name, route] of before) {
    if (!after.has(name)) changes.push(`- ${name} — ${describe(route)}`);
  }
  return { changes, findings };
}

function git(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout : '';
}

function main(): void {
  const baseIndex = process.argv.indexOf('--base');
  const base = baseIndex === -1 ? undefined : process.argv[baseIndex + 1];
  const before = git(['show', `${base ?? 'HEAD'}:${ROUTES_CATALOG}`]);
  const after =
    base === undefined ? git(['show', `:${ROUTES_CATALOG}`]) : readFileSync(ROUTES_CATALOG, 'utf8');
  const { changes, findings } = diffRouteAccess({ before, after });
  if (changes.length > 0) {
    console.log(`Route access changes (${changes.length}):`);
    for (const change of changes) console.log(`  ${change}`);
  }
  const reason = process.env.ROUTE_ACCESS_CHANGE_REASON?.trim();
  if (reason && findings.length > 0) {
    console.log(`✓ Route access diff: ${findings.length} widening(s), reason given: ${reason}`);
    for (const finding of findings) console.log(`  - ${finding}`);
    return;
  }
  process.exitCode = reportEarlyCheck({ check: 'Route access diff', findings });
  if (process.exitCode !== 0 || findings.length > 0) {
    console.error('  Meant? Commit again with ROUTE_ACCESS_CHANGE_REASON="<why>".');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
