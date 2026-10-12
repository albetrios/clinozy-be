import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { createMembershipPreferencesController } from './membership-preferences.controller.js';
import { updateMembershipPreferencesDto } from './membership-preferences.dto.js';
import type { MembershipPreferencesService } from './membership-preferences.service.js';

/** Registers `GET`/`PATCH /app/memberships/me/preferences` (prefix `/api/v1/app`, launch §2.F). */
export function membershipPreferencesRoutes(
  service: MembershipPreferencesService,
): FastifyPluginAsync {
  const controller = createMembershipPreferencesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/memberships/me/preferences',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get my preferences',
          description:
            "Returns the caller's own settings in the active organization — pinned sections, theme, branch filter, patient-file pins, recent picks — or the defaults (id null) before the first save. Every member; an API key has no membership (403).",
          tags: ['Preference'],
        },
      },
      controller.getMine,
    );
    zodApplication.patch(
      '/memberships/me/preferences',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Save my preferences',
          description:
            "Saves any of the caller's own settings; the first save creates them. Each list sent replaces the saved one: branch_ids names branches the caller can see ([] = every branch); recent_picks keeps the newest 3 per room:field. Optional expected_updated_at refuses a stale save (409). Every member; an API key has no membership (403).",
          tags: ['Preference'],
          body: updateMembershipPreferencesDto,
        },
      },
      controller.updateMine,
    );
  };
}
