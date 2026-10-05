import type { FastifyRequest } from 'fastify';
import { attachRequestPrincipalScope } from '@/shared/middlewares/core/auth.middleware.js';

/**
 * Mirrors the auth middleware's eager `request.principalScope` attachment on a
 * hand-built fake request, so controller unit suites exercise the REAL request
 * mint (`PRINCIPAL_SCOPE.REQUEST` over `request.auth`) exactly as the
 * production middleware does. Implemented as a lazy getter because test
 * factories often set `request.auth` AFTER building the request object.
 *
 * The auth stub is the principal as the auth middleware decodes it: its `kind`, and the active
 * organization in `organizationPublicId` (the signed `org` claim) — no route carries an
 * organization path parameter.
 */
export function attachPrincipalScope<T extends object>(request: T): T {
  Object.defineProperty(request, 'principalScope', {
    configurable: true,
    get: () => {
      const auth = (request as { auth?: Record<string, unknown> | null }).auth;
      if (!auth) return undefined;
      const carrier = { auth } as unknown as FastifyRequest;
      attachRequestPrincipalScope(carrier);
      return (carrier as { principalScope?: unknown }).principalScope;
    },
  });
  return request;
}
