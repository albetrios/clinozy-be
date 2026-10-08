import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { createMembershipSavedViewsController } from './membership-saved-views.controller.js';
import {
  createMembershipSavedViewDto,
  membershipSavedViewIdParamsDto,
  updateMembershipSavedViewDto,
} from './membership-saved-views.dto.js';
import type { MembershipSavedViewsService } from './membership-saved-views.service.js';

/** Registers `/app/memberships/me/saved-views` (prefix `/api/v1/app`, launch §2.G). */
export function membershipSavedViewsRoutes(
  service: MembershipSavedViewsService,
): FastifyPluginAsync {
  const controller = createMembershipSavedViewsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/memberships/me/saved-views',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List my saved views',
          description:
            "Returns one page of the caller's own saved views — list_key narrows to one list, q matches the label; sort created_at (default, oldest first — the chips' order) or label. Every member; an API key has no membership (403).",
          tags: ['Saved view'],
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/memberships/me/saved-views',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Save a view',
          description:
            "Saves a list's filters under a label. filters must be filters that list takes (400 otherwise); a label is unique per list (409 view_exists); at most 20 views per list (409 view_limit). Every member.",
          tags: ['Saved view'],
          body: createMembershipSavedViewDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { membership_saved_view_id: string } }>(
      '/memberships/me/saved-views/:membership_saved_view_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get my saved view',
          description:
            "Returns one of the caller's own saved views; another member's is a 404. Every member.",
          tags: ['Saved view'],
          params: membershipSavedViewIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { membership_saved_view_id: string } }>(
      '/memberships/me/saved-views/:membership_saved_view_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update my saved view',
          description:
            'Renames a saved view or changes its filters or hidden columns; its list_key never changes. Send expected_updated_at (the updated_at you read) and a save over a newer change is a 409 (D43). Every member.',
          tags: ['Saved view'],
          params: membershipSavedViewIdParamsDto,
          body: updateMembershipSavedViewDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { membership_saved_view_id: string } }>(
      '/memberships/me/saved-views/:membership_saved_view_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Remove my saved view',
          description:
            "Removes one of the caller's own saved views for good — there is no restore (U6). Every member.",
          tags: ['Saved view'],
          params: membershipSavedViewIdParamsDto,
        },
      },
      controller.remove,
    );
  };
}
