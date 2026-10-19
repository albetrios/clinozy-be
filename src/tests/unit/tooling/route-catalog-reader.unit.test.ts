import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRouteCatalog } from '@tooling/openapi/route-catalog/catalog-reader.js';

const CATALOG = [
  '================================================================================',
  '  ROUTE CATALOG — Demo',
  '  DOMAIN: APP (/api/v1/app)',
  '    — Sub Domains —',
  '  GET    /api/v1/app/leads                     200  -    both  PERM: lead:read',
  '  POST   /api/v1/app/leads/:lead_id/notes      ???  req  team  PERM: lead:update + note:create   ',
  '  DOMAIN: HEALTH (/livez)',
  '  GET    /livez                                200  -    ???   PUBLIC',
  '  SUMMARY',
  '  POST   /api/v1/app/leads                     200  req  both  PERM: lead:create',
].join('\n');

describe('parseRouteCatalog', () => {
  it('reads every column as written, under its domain section, and stops at SUMMARY', () => {
    expect(parseRouteCatalog(CATALOG)).toEqual([
      {
        method: 'GET',
        path: '/api/v1/app/leads',
        apiPath: '/app/leads',
        successStatus: 200,
        isIdempotencyRequired: false,
        isTeamOnly: false,
        gate: 'PERM: lead:read',
        domainPrefix: '/api/v1/app',
      },
      {
        method: 'POST',
        path: '/api/v1/app/leads/:lead_id/notes',
        apiPath: '/app/leads/:lead_id/notes',
        successStatus: null,
        isIdempotencyRequired: true,
        isTeamOnly: true,
        gate: 'PERM: lead:update + note:create',
        domainPrefix: '/api/v1/app',
      },
      {
        method: 'GET',
        path: '/livez',
        apiPath: '/livez',
        successStatus: 200,
        isIdempotencyRequired: false,
        isTeamOnly: false,
        gate: 'PUBLIC',
        domainPrefix: '/livez',
      },
    ]);
  });

  it('reads the committed catalog: every route, its total and its gates', () => {
    const catalog = readFileSync('docs/routes.txt', 'utf8');
    const total = Number(/Total routes: (\d+)/.exec(catalog)?.[1]);
    const routes = parseRouteCatalog(catalog);
    expect(total).toBeGreaterThan(100);
    expect(routes).toHaveLength(total);
    expect(routes.every((route) => route.domainPrefix !== '')).toBe(true);
    expect(new Set(routes.map((route) => `${route.method} ${route.path}`)).size).toBe(total);
  });
});

/** The files allowed a `(GET|POST|…)` pattern, each for a format that is not the catalog. */
const OTHER_FORMATS: Readonly<Record<string, string>> = {
  'tooling/openapi/route-catalog/catalog-reader.ts': 'the one docs/routes.txt parser',
  'tooling/iterations/iteration-frontend-map.util.ts': 'the route review’s Markdown tables',
  'tooling/ci/check-load-coverage.mjs': 'the k6 scenarios’ request calls',
};

/**
 * Locks in one parser of `docs/routes.txt`: the route-access diff, the iteration frontend map, the
 * test registries, the coverage audit and the load-coverage check all read it through
 * `parseRouteCatalog`, so no reader can drift from the formatter that writes it.
 */
describe('one docs/routes.txt parser', () => {
  it('holds an HTTP-method line pattern only where a listed format needs one', () => {
    const files = ['src', 'tooling'].flatMap((root) =>
      readdirSync(root, { recursive: true, encoding: 'utf8' })
        .map((path) => join(root, path))
        .filter((path) => /\.(?:ts|mts|mjs)$/.test(path) && !/\.test\.ts$/.test(path)),
    );
    const withPattern = files.filter((path) =>
      /\((?:GET\|POST\|PATCH\|PUT\|DELETE|GET\|POST\|PUT\|PATCH\|DELETE)\)/.test(
        readFileSync(path, 'utf8'),
      ),
    );
    expect(withPattern.sort()).toEqual(Object.keys(OTHER_FORMATS).sort());
  });
});
