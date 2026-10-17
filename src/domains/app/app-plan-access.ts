import type { FastifyRequest } from 'fastify';
import type { PrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { WRITE_HTTP_METHODS } from '@/shared/constants/index.js';

/**
 * The billing check behind the app domain's write guard — satisfied by
 * `SubscriptionService.assertOrganizationWritable`, wired in by the composition root.
 */
export type AppPlanAccessPort = {
  assertOrganizationWritable(options: { organizationPublicId: string }): Promise<void>;
};

/**
 * Builds the `preHandler` the app domain runs on every route under `/api/v1/app/`: a write
 * (POST / PUT / PATCH / DELETE) from a read-only clinic answers 403 `organization_read_only`
 * (owner decision D3, 2026-10-17). Reads always pass.
 *
 * @remarks
 * - **Algorithm:** returns at once for a read, or when the request carries no organization (the
 *   route's own gates answer it); otherwise asks the plan access port about the organization of the
 *   signed `org` claim — nothing while `BILLING_READ_ONLY_ENFORCED` is off, one indexed query when on.
 * - **Failure modes:** `ForbiddenError` with `error.reason` `organization_read_only` from the port.
 * - **Notes:** registered once on the app routes plugin, so it runs after authentication (the
 *   route's `onRequest`) and body validation, and before the route's permission gate and the
 *   idempotency claim — a refused write holds no idempotency key. Nothing outside `/api/v1/app/`
 *   is guarded: billing, auth, user, tenancy and upload stay writable so a clinic can pay, sign in,
 *   manage its team and export its data.
 */
export function createAppWriteAccessPreHandler(
  planAccess: AppPlanAccessPort,
): (request: FastifyRequest) => Promise<void> {
  return async (request: FastifyRequest): Promise<void> => {
    if (!WRITE_HTTP_METHODS.has(request.method)) return;
    const principalScope = request.principalScope as PrincipalDatabaseScope | null | undefined;
    const organizationPublicId = principalScope?.organizationPublicId;
    if (organizationPublicId === undefined) return;
    await planAccess.assertOrganizationWritable({ organizationPublicId });
  };
}
