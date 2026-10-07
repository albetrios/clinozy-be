import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { SavedViewsService } from './saved-views.service.js';
import { createSavedViewsController } from './saved-views.controller.js';
import {
  CreateSavedViewDto,
  UpdateSavedViewDto,
  listSavedViewsQueryDto,
  savedViewsIdParamsDto,
} from './saved-views.dto.js';

/** Registers the `saved-views` routes (prefix `/api/v1/app`). */
export function savedViewsRoutes(service: SavedViewsService): FastifyPluginAsync {
  const controller = createSavedViewsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/saved-views',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List saved views',
          description:
            "Returns one page of the active organization's saved views (newest first by default), with the total count; `q` searches, filters narrow. Requires organization:read (every member).",
          tags: ['Saved view'],
          querystring: listSavedViewsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/saved-views',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create saved view',
          description:
            'Adds a saved view to the active organization. Requires organization:read (every member).',
          tags: ['Saved view'],
          body: CreateSavedViewDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { saved_view_id: string } }>(
      '/saved-views/:saved_view_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get saved view',
          description:
            'Returns one saved view of the active organization. Requires organization:read (every member).',
          tags: ['Saved view'],
          params: savedViewsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { saved_view_id: string } }>(
      '/saved-views/:saved_view_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update saved view',
          description:
            "Changes any of a saved view's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires organization:read (every member).",
          tags: ['Saved view'],
          params: savedViewsIdParamsDto,
          body: UpdateSavedViewDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { saved_view_id: string } }>(
      '/saved-views/:saved_view_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete saved view',
          description:
            "Soft-deletes a saved view with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires organization:read (every member).",
          tags: ['Saved view'],
          params: savedViewsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { saved_view_id: string } }>(
      '/saved-views/:saved_view_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore saved view',
          description:
            "Undoes a saved view's delete. A live saved view is a 409. Requires organization:read (every member).",
          tags: ['Saved view'],
          params: savedViewsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
