import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { StockCountsService } from './stock-counts.service.js';
import { createStockCountsController } from './stock-counts.controller.js';
import {
  CreateStockCountDto,
  listStockCountsQueryDto,
  stockCountsIdParamsDto,
} from './stock-counts.dto.js';

/** Registers the `stock-counts` routes (prefix `/api/v1/app`). */
export function stockCountsRoutes(service: StockCountsService): FastifyPluginAsync {
  const controller = createStockCountsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/stock-counts',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List stock counts',
          description:
            "Returns one page of the active organization's stock counts (newest first by default), with the total count; `q` searches, filters narrow. Requires stock_item:read.",
          tags: ['Stock'],
          querystring: listStockCountsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/stock-counts',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create stock count',
          description: 'Adds a stock count to the active organization. Requires stock_item:update.',
          tags: ['Stock'],
          body: CreateStockCountDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { stock_count_id: string } }>(
      '/stock-counts/:stock_count_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get stock count',
          description:
            'Returns one stock count of the active organization. Requires stock_item:read.',
          tags: ['Stock'],
          params: stockCountsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.delete<{ Params: { stock_count_id: string } }>(
      '/stock-counts/:stock_count_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete stock count',
          description:
            "Soft-deletes a stock count with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires stock_item:update.",
          tags: ['Stock'],
          params: stockCountsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { stock_count_id: string } }>(
      '/stock-counts/:stock_count_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore stock count',
          description:
            "Undoes a stock count's delete. A live stock count is a 409. Requires stock_item:update.",
          tags: ['Stock'],
          params: stockCountsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
