import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { ManufacturersService } from './manufacturers.service.js';
import { createManufacturersController } from './manufacturers.controller.js';
import {
  CreateManufacturerDto,
  UpdateManufacturerDto,
  listManufacturersQueryDto,
  manufacturersIdParamsDto,
} from './manufacturers.dto.js';

/** Registers the `manufacturers` routes (prefix `/api/v1/app`). */
export function manufacturersRoutes(service: ManufacturersService): FastifyPluginAsync {
  const controller = createManufacturersController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/manufacturers',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MANUFACTURER_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List manufacturers',
          description:
            "Returns one page of the active organization's manufacturers (newest first by default), with the total count; `q` searches, filters narrow. Requires manufacturer:read.",
          tags: ['Medical store'],
          querystring: listManufacturersQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/manufacturers',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MANUFACTURER_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create manufacturer',
          description:
            'Adds a manufacturer to the active organization. Requires manufacturer:create.',
          tags: ['Medical store'],
          body: CreateManufacturerDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { manufacturer_id: string } }>(
      '/manufacturers/:manufacturer_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MANUFACTURER_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get manufacturer',
          description:
            'Returns one manufacturer of the active organization. Requires manufacturer:read.',
          tags: ['Medical store'],
          params: manufacturersIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { manufacturer_id: string } }>(
      '/manufacturers/:manufacturer_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MANUFACTURER_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update manufacturer',
          description:
            "Changes any of a manufacturer's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires manufacturer:update.",
          tags: ['Medical store'],
          params: manufacturersIdParamsDto,
          body: UpdateManufacturerDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { manufacturer_id: string } }>(
      '/manufacturers/:manufacturer_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MANUFACTURER_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete manufacturer',
          description:
            "Soft-deletes a manufacturer with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires manufacturer:delete.",
          tags: ['Medical store'],
          params: manufacturersIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { manufacturer_id: string } }>(
      '/manufacturers/:manufacturer_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.MANUFACTURER_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore manufacturer',
          description:
            "Undoes a manufacturer's delete. A live manufacturer is a 409. Requires manufacturer:delete.",
          tags: ['Medical store'],
          params: manufacturersIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
