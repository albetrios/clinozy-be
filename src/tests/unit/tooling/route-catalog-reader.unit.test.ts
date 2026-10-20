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

  it('reads docs/routes.txt only through the catalog reader, or for a listed reason', () => {
    // A parser needs no method regex: the drill's A8-5 split each line on whitespace and checked a
    // METHODS set, which the pattern test above cannot see. So the test follows the file instead:
    // whoever reads docs/routes.txt imports the reader, or is listed here with why it reads the text.
    const readers = sourceFiles().filter((path) => readsRouteCatalog(readFileSync(path, 'utf8')));
    expect(readers.length).toBeGreaterThan(0);
    const offList = readers.filter(
      (path) =>
        !(
          path in RAW_CATALOG_READERS ||
          /route-catalog\/catalog-reader\.(?:js|ts)['"]/.test(readFileSync(path, 'utf8'))
        ),
    );
    expect(offList).toEqual([]);
  });
});

/** The files that read the catalog's text without the reader, each with its reason. */
const RAW_CATALOG_READERS: Readonly<Record<string, string>> = {
  'tooling/openapi/route-catalog/catalog-reader.ts': 'the reader itself',
  'src/infrastructure/mcp/mcp-server.ts': 'serves the catalog text verbatim as an MCP resource',
  'src/scripts/codegen/generate-route-catalog.ts':
    'writes the catalog and compares its own output byte for byte',
  'tooling/iterations/frontend-route-map.ts':
    'hands the text to iteration-frontend-map.util.ts, which parses it with the reader',
};

/** Every non-test code file under src/ and tooling/. */
function sourceFiles(): string[] {
  return ['src', 'tooling'].flatMap((root) =>
    readdirSync(root, { recursive: true, encoding: 'utf8' })
      .map((path) => join(root, path))
      .filter((path) => /\.(?:ts|mts|mjs)$/.test(path) && !/\.test\.ts$/.test(path)),
  );
}

/** Whether `source` reads docs/routes.txt: a `readFileSync` of a path naming it, directly or by a constant. */
function readsRouteCatalog(source: string): boolean {
  const code = source.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [
    ...code.matchAll(/const (\w+)\s*=\s*[^;]*(?:routes\.txt|CATALOG_OUTPUT_PATH)/g),
  ].map((match) => match[1]);
  return [...code.matchAll(/readFileSync\(([^)]*)/g)].some((match) => {
    const argument = match[1] ?? '';
    return (
      /routes\.txt|CATALOG_OUTPUT_PATH/.test(argument) ||
      names.some((name) => new RegExp(`\\b${name}\\b`).test(argument))
    );
  });
}
