import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every app route file (tests aside). */
function appRouteFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__') appRouteFiles(path, found);
    } else if (entry.endsWith('.routes.ts')) {
      found.push(path);
    }
  }
  return found;
}

/** Each `GET …/exports` registration of a route file: its path and its options' source. */
function exportRoutes(source: string): { path: string; options: string }[] {
  const routes: { path: string; options: string }[] = [];
  for (const match of source.matchAll(/\.get(?:<[^>]*>)?\(\s*'([^']*\/exports)'/g)) {
    const start = (match.index ?? 0) + match[0].length;
    const next = source.indexOf('zodApplication.', start);
    routes.push({
      path: match[1] ?? '',
      options: source.slice(start, next === -1 ? undefined : next),
    });
  }
  return routes;
}

/**
 * Policy (D-4): every `GET /app/…/exports` route spends the export budget — 5 per 5 minutes per
 * organization and actor (`EXPORT_AUTHED_RATE_LIMIT`), never the 100-a-minute organization preset —
 * and runs through a handler that takes an export slot and writes the export audit row (B1-3).
 */
describe('App export routes — rate limit, slot and audit (D-4, B1-3)', () => {
  const routes = appRouteFiles(join(process.cwd(), 'src/domains/app')).flatMap((file) =>
    exportRoutes(readFileSync(file, 'utf-8')).map((route) => ({ file, ...route })),
  );

  it('finds every export route', () => {
    expect(routes.length).toBeGreaterThanOrEqual(14);
  });

  it.each(routes.map((route) => [route.path, route.options]))(
    '%s spends EXPORT_AUTHED_RATE_LIMIT and an export handler',
    (_path, options) => {
      expect(options).toContain('...EXPORT_AUTHED_RATE_LIMIT');
      expect(options).not.toContain('ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT');
      expect(options).toMatch(/[cC]ontroller\.(export|collectionExport\('[^']+'\)),/);
    },
  );
});
