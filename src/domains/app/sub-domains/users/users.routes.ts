import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { createAppUsersController } from './users.controller.js';
import { listAppUsersQueryDto } from './users.dto.js';
import type { AppUsersService } from './users.service.js';

/** Registers `GET /app/users` (prefix `/api/v1/app`). */
export function appUsersRoutes(service: AppUsersService): FastifyPluginAsync {
  const controller = createAppUsersController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/users',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List users',
          description:
            'Returns the active team members — name, colour, roles and branches. Staff, doctors or therapists are users filtered by role_id (any held role); branch_id narrows to one branch; q matches name or email. Every member.',
          tags: ['Membership'],
          querystring: listAppUsersQueryDto,
        },
      },
      controller.list,
    );
  };
}
