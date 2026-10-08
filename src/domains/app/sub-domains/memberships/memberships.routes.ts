import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { createAppMembershipsController } from './memberships.controller.js';
import type { AppMembershipsService } from './memberships.service.js';

/** Registers `GET /app/memberships` (prefix `/api/v1/app`). */
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
            'The team picker and member directory — every member reads it. Active members by name, with their colour, roles and branches: role_id (any held role) and branch_id narrow it, q matches name or email. include_ended=true lists every membership, any status, live or ended, with is_active and ended_at; ids resolves given memberships. Paged with limit and after.',
          tags: ['Membership'],
        },
      },
      controller.list,
    );
  };
}
