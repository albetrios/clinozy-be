import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { StockVendorsService } from './stock-vendors.service.js';
import { createStockVendorsController } from './stock-vendors.controller.js';
import {
  CreateStockVendorDto,
  UpdateStockVendorDto,
  listStockVendorsQueryDto,
  stockVendorsIdParamsDto,
} from './stock-vendors.dto.js';

/** Registers the `stock-vendors` routes (prefix `/api/v1/app`). */
export function stockVendorsRoutes(service: StockVendorsService): FastifyPluginAsync {
  const controller = createStockVendorsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/stock-vendors',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_VENDOR_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List stock vendors',
          description:
            "Returns one page of the active organization's stock vendors (newest first by default), with the total count; `q` searches, filters narrow. Requires stock_vendor:read.",
          tags: ['Stock'],
          querystring: listStockVendorsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/stock-vendors',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_VENDOR_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create stock vendor',
          description:
            'Adds a stock vendor to the active organization. Requires stock_vendor:create.',
          tags: ['Stock'],
          body: CreateStockVendorDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { stock_vendor_id: string } }>(
      '/stock-vendors/:stock_vendor_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_VENDOR_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get stock vendor',
          description:
            'Returns one stock vendor of the active organization. Requires stock_vendor:read.',
          tags: ['Stock'],
          params: stockVendorsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { stock_vendor_id: string } }>(
      '/stock-vendors/:stock_vendor_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_VENDOR_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update stock vendor',
          description:
            "Changes any of a stock vendor's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires stock_vendor:update.",
          tags: ['Stock'],
          params: stockVendorsIdParamsDto,
          body: UpdateStockVendorDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { stock_vendor_id: string } }>(
      '/stock-vendors/:stock_vendor_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_VENDOR_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete stock vendor',
          description:
            "Soft-deletes a stock vendor with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires stock_vendor:delete.",
          tags: ['Stock'],
          params: stockVendorsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { stock_vendor_id: string } }>(
      '/stock-vendors/:stock_vendor_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_VENDOR_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore stock vendor',
          description:
            "Undoes a stock vendor's delete. A live stock vendor is a 409. Requires stock_vendor:delete.",
          tags: ['Stock'],
          params: stockVendorsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
