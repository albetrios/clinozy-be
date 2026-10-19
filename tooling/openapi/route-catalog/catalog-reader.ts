// No relative imports: plain `node` loads this file too (tooling/ci/check-load-coverage.mjs).
import { readFileSync } from 'node:fs';

/** One route line of `docs/routes.txt`, column for column as `catalog-formatter.ts` writes it. */
export interface CatalogRoute {
  /** `GET`, `POST`, `PATCH`, `PUT` or `DELETE`. */
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** The path as written: `/api/v1/…` with `:param` segments, or a root path (`/livez`). */
  readonly path: string;
  /** {@link CatalogRoute.path} without its `/api/v<major>` prefix; a root path stays as it is. */
  readonly apiPath: string;
  /** The `S` column, or `null` where the catalog writes `???` (no declared success status). */
  readonly successStatus: number | null;
  /** The `I` column: whether `X-Idempotency-Key` is required (`req`). */
  readonly isIdempotencyRequired: boolean;
  /** The `O` column: whether the route refuses a personal organization (`team`). */
  readonly isTeamOnly: boolean;
  /** The gate column: `PUBLIC`, `AUTH`, `ROLE: …`, `PERM: <code>[ + <code>…]` or `TOKEN: …`. */
  readonly gate: string;
  /** The prefix of the `DOMAIN: <label> (<prefix>)` section the route is listed under. */
  readonly domainPrefix: string;
}

const API_VERSION_PREFIX = /^\/api\/v\d+(?=\/)/;
const DOMAIN_HEADER = /^ {2}DOMAIN: .+ \(([^)]+)\)$/;
const ROUTE_LINE =
  /^ {2}(GET|POST|PATCH|PUT|DELETE) +(\/\S*) +(\d{3}|\?\?\?) +(req|-) +(both|team|\?\?\?) +(PUBLIC|AUTH|(?:ROLE|PERM|TOKEN): .+)$/;

/**
 * Reads the route section of `docs/routes.txt` (`pnpm routes:catalog`) into its routes — the one
 * parser of the catalog, beside the formatter that writes it.
 *
 * @remarks
 * It stops at `SUMMARY`: the sections after it (the idempotency-required list, the permission
 * index) repeat routes. Every reader — the route-access diff, the iteration frontend map, the
 * test registries and the coverage audit — takes its view from these fields instead of matching
 * the lines itself.
 */
export function parseRouteCatalog(catalog: string): CatalogRoute[] {
  const routes: CatalogRoute[] = [];
  let domainPrefix = '';
  for (const rawLine of catalog.split('\n')) {
    const line = rawLine.trimEnd();
    if (line === '  SUMMARY') break;
    const domain = DOMAIN_HEADER.exec(line);
    if (domain?.[1]) {
      domainPrefix = domain[1];
      continue;
    }
    const match = ROUTE_LINE.exec(line);
    if (!match) continue;
    const [, method, path, status, idempotency, scope, gate] = match;
    if (!(method && path && status && gate)) continue;
    routes.push({
      method: method as CatalogRoute['method'],
      path,
      apiPath: path.replace(API_VERSION_PREFIX, ''),
      successStatus: status === '???' ? null : Number(status),
      isIdempotencyRequired: idempotency === 'req',
      isTeamOnly: scope === 'team',
      gate,
      domainPrefix,
    });
  }
  return routes;
}

/**
 * Reads and parses the catalog file at `catalogPath` (the committed one is `docs/routes.txt`).
 *
 * @remarks
 * A convenience over {@link parseRouteCatalog} for the readers that load the committed file.
 */
export function readRouteCatalog(catalogPath: string): CatalogRoute[] {
  return parseRouteCatalog(readFileSync(catalogPath, 'utf-8'));
}
