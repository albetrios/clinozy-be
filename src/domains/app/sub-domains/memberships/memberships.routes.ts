import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { createAppMembershipsController } from './memberships.controller.js';
import type { AppMembershipsService } from './memberships.service.js';

/** Registers `GET /app/memberships` and `GET /app/roles` (prefix `/api/v1/app`). */
export function appMembershipsRoutes(service: AppMembershipsService): FastifyPluginAsync {
  const controller = createAppMembershipsController(service);
  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/memberships',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List memberships (picker)',
          description:
            'The team picker and member directory — every member reads it. Active members by name, with their colour, roles, branches and whether they own the organization (is_owner): role_id (any held role), branch_id and holds (a permission code one of their roles grants, e.g. holds=task:read for a task assignee) narrow it, q matches name or email. include_ended=true lists every membership, any status, live or ended, with is_active and ended_at; ids resolves given memberships. Paged with limit and after.',
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
