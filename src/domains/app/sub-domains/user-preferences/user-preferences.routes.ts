// hand-edited — the singleton preference routes.
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { UserPreferencesService } from './user-preferences.service.js';
import { createUserPreferencesController } from './user-preferences.controller.js';
import { UpdateUserPreferenceDto } from './user-preferences.dto.js';

/** Registers `GET`/`PATCH /app/user-preferences` (prefix `/api/v1/app`). */
export function userPreferencesRoutes(service: UserPreferencesService): FastifyPluginAsync {
  const controller = createUserPreferencesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/user-preferences',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get my preferences',
          description:
            "Returns the caller's own settings in the active organization — pinned sections, branch filter, theme, patient-file pins, recent picks — or the defaults (id null) before the first save. Every member.",
          tags: ['Preference'],
        },
      },
      controller.getMine,
    );
    zodApplication.patch(
      '/user-preferences',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update my preferences',
          description:
            "Saves any of the caller's own settings (the first save creates them). branch_filter_ids replaces the list; [] means every branch. Every member.",
          tags: ['Preference'],
          body: UpdateUserPreferenceDto,
        },
      },
      controller.updateMine,
    );
  };
}
