import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import type { OfferingsService } from './offerings.service.js';
import { createOfferingsController } from './offerings.controller.js';
import {
  CreateOfferingDto,
  UpdateOfferingDto,
  listOfferingsQueryDto,
  offeringsIdParamsDto,
} from './offerings.dto.js';

/** Registers the `offerings` routes (prefix `/api/v1/app`). */
export function offeringsRoutes(service: OfferingsService): FastifyPluginAsync {
  const controller = createOfferingsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/offerings',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List offerings',
          description:
            "Returns one page of the active organization's offerings (newest first by default), with the total count; `q` searches, filters narrow. Requires organization:read (every member).",
          tags: ['Offering'],
          querystring: listOfferingsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/offerings/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LIST_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export offerings',
          description:
            'Returns the offerings the same filters and sort as the list would (every page, up to 5,000 rows) as a CSV file inside the JSON envelope (`file_name`, `content_type`, `row_count`, `is_truncated`, `content`). Requires `list:export` ("Export lists") and organization:read (every member).',
          tags: ['Offering'],
          querystring: listOfferingsQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/offerings',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create offering',
          description: 'Adds a offering to the active organization. Requires offering:create.',
          tags: ['Offering'],
          body: CreateOfferingDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { offering_id: string } }>(
      '/offerings/:offering_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.ORGANIZATION_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get offering',
          description:
            'Returns one offering of the active organization. Requires organization:read (every member).',
          tags: ['Offering'],
          params: offeringsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { offering_id: string } }>(
      '/offerings/:offering_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update offering',
          description:
            "Changes any of a offering's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires offering:update.",
          tags: ['Offering'],
          params: offeringsIdParamsDto,
          body: UpdateOfferingDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { offering_id: string } }>(
      '/offerings/:offering_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete offering',
          description:
            "Soft-deletes a offering with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires offering:delete.",
          tags: ['Offering'],
          params: offeringsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { offering_id: string } }>(
      '/offerings/:offering_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFERING_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore offering',
          description:
            "Undoes a offering's delete. A live offering is a 409. Requires offering:delete.",
          tags: ['Offering'],
          params: offeringsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
