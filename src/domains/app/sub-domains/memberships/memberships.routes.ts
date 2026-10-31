import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import {
  assertOrganizationPermission,
  hasOrganizationPermission,
  requireOrganizationPermission,
} from '@/shared/utils/auth/authorization.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { createAppMembershipsController } from './memberships.controller.js';
import type { AppMembershipsService } from './memberships.service.js';
import { validateListAppMembershipsQuery } from './memberships.validator.js';

/**
 * E-4: the team directory is every member's, but two of its filters probe it — `q` matches a login
 * email, `holds` finds who holds a permission code. Both take `membership:read`, the code the
 * member list itself needs; `holds` is open without it only for a code the caller holds itself (the
 * task assignee picker asks for `task:read`), so nobody can find who holds what they lack — who can
 * delete the organization, who manages billing.
 *
 * @remarks
 * - **Algorithm:** the query is parsed first (a bad one stays a 400); then `q` →
 *   `membership:read`; `holds` → its own code, else `membership:read`.
 * - **Failure modes:** `ValidationError` (400); `ForbiddenError` (`missing_permission`, audited)
 *   from {@link assertOrganizationPermission}.
 */
async function requireMembershipReadForDirectoryProbes(request: FastifyRequest): Promise<void> {
  const parsed = validateListAppMembershipsQuery(request.query);
  if (parsed.q !== undefined) {
    await assertOrganizationPermission({
      request,
      permissionCode: TENANCY_PERMISSIONS.MEMBERSHIP_READ,
    });
  }
  if (
    parsed.holds !== undefined &&
    !(await hasOrganizationPermission({ request, permissionCode: parsed.holds }))
  ) {
    await assertOrganizationPermission({
      request,
      permissionCode: TENANCY_PERMISSIONS.MEMBERSHIP_READ,
    });
  }
}

/** Registers `GET /app/memberships` and `GET /app/roles` (prefix `/api/v1/app`). */
export function appMembershipsRoutes(service: AppMembershipsService): FastifyPluginAsync {
  const controller = createAppMembershipsController(service);
  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/memberships',
      {
        onRequest: [app.authenticate],
        preHandler: [
          requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ),
          requireMembershipReadForDirectoryProbes,
        ],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List memberships (picker)',
          description:
            'The team picker and member directory — every member reads it. Active members by name, with their colour, roles, branches and whether they own the organization (is_owner): role_id (any held role), branch_id and holds (a permission code one of their roles grants, e.g. holds=task:read for a task assignee) narrow it, q matches name or email. q needs membership:read, and so does holds for a code you do not hold yourself (403 otherwise). include_ended=true lists every membership, any status, live or ended, with is_active and ended_at; ids resolves given memberships. Paged with limit and after.',
          tags: ['Membership'],
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/roles',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List roles (directory)',
          description:
            "The role directory — every member reads it, as the member directory: each role's name, colour, whether it is a fixed role (is_system) and whether its access is locked (is_locked — Owner and Admin), so a role id in role_ids reads as a name. In the order the roles were made: Owner, Admin, the clinic roles, then the custom ones. No codes and no member counts (those need role:read, /tenancy/organization/roles). Paged with limit and after.",
          tags: ['Role'],
        },
      },
      controller.listRoles,
    );
  };
}
