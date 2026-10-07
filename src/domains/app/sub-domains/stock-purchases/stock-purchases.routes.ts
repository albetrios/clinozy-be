import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { StockPurchasesService } from './stock-purchases.service.js';
import { createStockPurchasesController } from './stock-purchases.controller.js';
import {
  CreateStockPurchaseDto,
  UpdateStockPurchaseDto,
  listStockPurchasesQueryDto,
  stockPurchasesIdParamsDto,
} from './stock-purchases.dto.js';

/** Registers the `stock-purchases` routes (prefix `/api/v1/app`). */
export function stockPurchasesRoutes(service: StockPurchasesService): FastifyPluginAsync {
  const controller = createStockPurchasesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/stock-purchases',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_PURCHASE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List stock purchases',
          description:
            "Returns one page of the active organization's stock purchases (newest first by default), with the total count; `q` searches, filters narrow. Requires stock_purchase:read.",
          tags: ['Stock'],
          querystring: listStockPurchasesQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/stock-purchases/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LIST_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export stock purchases',
          description:
            'Returns the stock purchases the same filters and sort as the list would (every page, up to 5,000 rows) as a CSV file inside the JSON envelope (`file_name`, `content_type`, `row_count`, `is_truncated`, `content`). Requires `list:export` ("Export lists") and stock_purchase:read.',
          tags: ['Stock'],
          querystring: listStockPurchasesQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/stock-purchases',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_PURCHASE_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create stock purchase',
          description:
            'Adds a stock purchase to the active organization. Requires stock_purchase:create.',
          tags: ['Stock'],
          body: CreateStockPurchaseDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { stock_purchase_id: string } }>(
      '/stock-purchases/:stock_purchase_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_PURCHASE_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get stock purchase',
          description:
            'Returns one stock purchase of the active organization. Requires stock_purchase:read.',
          tags: ['Stock'],
          params: stockPurchasesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { stock_purchase_id: string } }>(
      '/stock-purchases/:stock_purchase_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_PURCHASE_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update stock purchase',
          description:
            "Changes any of a stock purchase's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires stock_purchase:update.",
          tags: ['Stock'],
          params: stockPurchasesIdParamsDto,
          body: UpdateStockPurchaseDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { stock_purchase_id: string } }>(
      '/stock-purchases/:stock_purchase_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_PURCHASE_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete stock purchase',
          description:
            "Soft-deletes a stock purchase with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires stock_purchase:delete.",
          tags: ['Stock'],
          params: stockPurchasesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { stock_purchase_id: string } }>(
      '/stock-purchases/:stock_purchase_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_PURCHASE_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore stock purchase',
          description:
            "Undoes a stock purchase's delete. A live stock purchase is a 409. Requires stock_purchase:delete.",
          tags: ['Stock'],
          params: stockPurchasesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
