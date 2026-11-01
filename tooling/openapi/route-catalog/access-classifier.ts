import type { RouteAccess } from './types.js';

/**
 * Joins the codes of a route that requires more than one (`PERM: patient:update +
 * patient:clinical_record:read`) — the catalogue's readers split on it.
 */
export const PERMISSION_CODE_SEPARATOR = ' + ';

export function extractRouteSnippet(content: string, methodIndex: number): string {
  const rest = content.slice(methodIndex);
  const nextRouteMatch = rest
    .slice(1)
    .match(/\n\s*[a-zA-Z][\w$]*\.(get|post|patch|put|delete)\s*[(<]/);
  if (nextRouteMatch?.index !== undefined) return rest.slice(0, nextRouteMatch.index + 1);
  // The file's last route: up to the close of its registration call (`    );`), so a long
  // `preHandler` list never pushes its `config` (the idempotency flag) out of the snippet.
  const callEnd = rest.search(/\n\s*\);/);
  return rest.slice(0, callEnd === -1 ? Math.min(rest.length, 500) : callEnd + 1);
}

export function classifyAccess(snippet: string, permissionMap: Map<string, string>): RouteAccess {
  if (snippet.includes("'/logout'") || snippet.includes('"/logout"')) {
    return 'TOKEN: access-token';
  }

  // `/refresh` carries no `app.authenticate` (the access token is expired by definition when a
  // client refreshes), but it is NOT public: the handler requires a valid `session_id` httpOnly
  // cookie and enforces the CSRF Origin/Referer allowlist. Cataloguing it PUBLIC misread the
  // route as unauthenticated.
  if (snippet.includes("'/refresh'") || snippet.includes('"/refresh"')) {
    return 'TOKEN: session-cookie';
  }

  if (!snippet.includes('app.authenticate')) {
    return 'PUBLIC';
  }

  if (snippet.includes('requireRole')) {
    const roles: string[] = [];
    if (snippet.includes('GLOBAL_ROLES.SUPER_ADMIN') || snippet.includes("'super_admin'")) {
      roles.push('super_admin');
    }
    if (snippet.includes('GLOBAL_ROLES.USER') || snippet.includes("'user'")) {
      roles.push('user');
    }
    const uniqueRoles = [...new Set(roles)];
    return `ROLE: ${uniqueRoles.join(', ')}`;
  }

  // Every code the route's gates require, in their order — a clinical note's write stacks
  // `patient:update` and `patient:clinical_record:read` (launch D83 (6), QA B1).
  const codes = [...snippet.matchAll(/requireOrganizationPermission\(\s*([\w.]+\.[\w]+)/g)].map(
    (match) => permissionMap.get(match[1] ?? '') ?? match[1] ?? '',
  );
  const required = [...new Set(codes.filter((code) => code !== ''))];
  if (required.length > 0) {
    return `PERM: ${required.join(PERMISSION_CODE_SEPARATOR)}`;
  }

  return 'AUTH';
}
