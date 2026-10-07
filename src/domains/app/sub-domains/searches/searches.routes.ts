import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { createSearchesController } from './searches.controller.js';
import { listSearchesQueryDto } from './searches.dto.js';
import type { SearchesService } from './searches.service.js';

/** Registers `GET /app/searches` (prefix `/api/v1/app`). */
export function searchesRoutes(service: SearchesService): FastifyPluginAsync {
  const controller = createSearchesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/searches',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Search records',
          description:
            'The command search: patients, leads, appointments and invoices matching q (≥ 3 characters — a name, phone digits or a number such as 2841 or #2841), 10 per kind. Appointments and invoices include those of the first patients found. A kind the caller may not read is empty; branch-scoped kinds show only the caller’s branches unless they hold branch:read.',
          tags: ['Search'],
          querystring: listSearchesQueryDto,
        },
      },
      controller.search,
    );
  };
}
