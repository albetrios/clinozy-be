import { join } from 'node:path';
import { readRouteCatalog } from '@tooling/openapi/route-catalog/catalog-reader.js';

export type RouteCatalogAccess =
  | 'public'
  | 'authenticated'
  | 'global-role'
  | 'organization-permission'
  | 'bearer-token';

export type RouteEntry = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  domain: string;
  subDomain?: string;
  access: RouteCatalogAccess;
  description: string;
};

const ROUTE_CATALOG_PATH = join(process.cwd(), 'docs', 'routes.txt');

function domainSlugFromPrefix(prefix: string): string {
  if (prefix === '/livez') return 'health';
  const segments = prefix.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? 'unknown';
}

function catalogAccessToRegistry(accessToken: string): RouteCatalogAccess {
  if (accessToken === 'PUBLIC') return 'public';
  if (accessToken === 'AUTH') return 'authenticated';
  if (accessToken.startsWith('ROLE')) return 'global-role';
  if (accessToken.startsWith('TOKEN')) return 'bearer-token';
  return 'organization-permission';
}

/**
 * Parses docs/routes.txt (pnpm routes:catalog) into typed route entries for tests — read by the
 * one catalog parser (`tooling/openapi/route-catalog/catalog-reader.ts`).
 */
export function loadRouteRegistryFromCatalog(
  catalogPath: string = ROUTE_CATALOG_PATH,
): RouteEntry[] {
  return readRouteCatalog(catalogPath).map((route) => ({
    method: route.method,
    path: route.path,
    domain: domainSlugFromPrefix(route.domainPrefix),
    access: catalogAccessToRegistry(route.gate),
    description: `${route.method} ${route.path}`,
  }));
}

export function getRoutesByDomain(domain: string, catalogPath?: string): RouteEntry[] {
  return loadRouteRegistryFromCatalog(catalogPath).filter((route) => route.domain === domain);
}

export function getRouteCount(catalogPath?: string): number {
  return loadRouteRegistryFromCatalog(catalogPath).length;
}

export type OrganizationPermissionRoute = RouteEntry & {
  /** The first code the route requires — its own gate. */
  permissionCode: string;
  /**
   * Every code the route requires, in the catalogue's order (`patient:update +
   * patient:clinical_record:read` — launch D83 (6)).
   */
  permissionCodes: string[];
};

/**
 * Routes from docs/routes.txt that require an organization permission (PERM: code).
 */
export function loadOrganizationPermissionRoutesFromCatalog(
  catalogPath: string = ROUTE_CATALOG_PATH,
): OrganizationPermissionRoute[] {
  return readRouteCatalog(catalogPath)
    .filter((route) => route.gate.startsWith('PERM:'))
    .map((route) => {
      const permissionCodes = route.gate
        .replace(/^PERM:\s*/, '')
        .split('+')
        .map((code) => code.trim())
        .filter((code) => code !== '');
      return {
        method: route.method,
        path: route.path,
        domain: domainSlugFromPrefix(route.domainPrefix),
        access: 'organization-permission',
        description: `${route.method} ${route.path}`,
        permissionCode: permissionCodes[0] ?? '',
        permissionCodes,
      };
    });
}
