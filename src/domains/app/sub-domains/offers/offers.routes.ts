import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { OffersService } from './offers.service.js';
import { createOffersController } from './offers.controller.js';
import {
  CreateOfferDto,
  UpdateOfferDto,
  listOffersQueryDto,
  offersIdParamsDto,
} from './offers.dto.js';

/** Registers the `offers` routes (prefix `/api/v1/app`). */
export function offersRoutes(service: OffersService): FastifyPluginAsync {
  const controller = createOffersController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/offers',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFER_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List offers',
          description:
            "Returns one page of the active organization's offers (newest first by default), with the total count; `q` searches, filters narrow. Requires offer:read.",
          tags: ['Offering'],
          querystring: listOffersQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/offers',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRICE_MANAGE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create offer',
          description: 'Adds a offer to the active organization. Requires price:manage.',
          tags: ['Offering'],
          body: CreateOfferDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { offer_id: string } }>(
      '/offers/:offer_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.OFFER_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get offer',
          description: 'Returns one offer of the active organization. Requires offer:read.',
          tags: ['Offering'],
          params: offersIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { offer_id: string } }>(
      '/offers/:offer_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRICE_MANAGE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update offer',
          description:
            "Changes any of a offer's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires price:manage.",
          tags: ['Offering'],
          params: offersIdParamsDto,
          body: UpdateOfferDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { offer_id: string } }>(
      '/offers/:offer_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRICE_MANAGE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete offer',
          description:
            "Soft-deletes a offer with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires price:manage.",
          tags: ['Offering'],
          params: offersIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { offer_id: string } }>(
      '/offers/:offer_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.PRICE_MANAGE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore offer',
          description: "Undoes a offer's delete. A live offer is a 409. Requires price:manage.",
          tags: ['Offering'],
          params: offersIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
