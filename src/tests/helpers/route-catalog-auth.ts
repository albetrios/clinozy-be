import { join } from 'node:path';
import { readRouteCatalog } from '@tooling/openapi/route-catalog/catalog-reader.js';

export type RouteCatalogAccess = 'AUTH' | 'ROLE' | 'PERM' | 'TOKEN';

export type ProtectedRouteFromCatalog = {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  access: RouteCatalogAccess;
};

const ROUTE_CATALOG_PATH = join(process.cwd(), 'docs', 'routes.txt');

/** Placeholder for path params (21-char public_id style). */
const PATH_PARAM_PLACEHOLDER = '000000000000000000000';

/**
 * Replaces OpenAPI-style path params with a stable placeholder for smoke requests.
 */
export function materializeRouteCatalogPath(path: string): string {
  return path.replace(/:[a-zA-Z_]+/g, PATH_PARAM_PLACEHOLDER).replace(/\/+$/, '') || '/';
}

/**
 * Parses docs/routes.txt for routes that require authentication (AUTH, ROLE, or PERM).
 */
export function loadProtectedRoutesFromCatalog(
  catalogPath: string = ROUTE_CATALOG_PATH,
): ProtectedRouteFromCatalog[] {
  const routes: ProtectedRouteFromCatalog[] = [];
  const seen = new Set<string>();

  for (const route of readRouteCatalog(catalogPath)) {
    if (route.gate === 'PUBLIC') continue;
    const method = route.method.toLowerCase() as ProtectedRouteFromCatalog['method'];
    const access: RouteCatalogAccess =
      route.gate === 'AUTH'
        ? 'AUTH'
        : route.gate.startsWith('ROLE')
          ? 'ROLE'
          : route.gate.startsWith('TOKEN')
            ? 'TOKEN'
            : 'PERM';

    const path = materializeRouteCatalogPath(route.path);
    const key = `${method}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    routes.push({ method, path, access });
  }

  return routes;
}
