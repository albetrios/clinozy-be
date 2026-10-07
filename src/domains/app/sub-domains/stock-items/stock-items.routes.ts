import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { recordDeleteQuerySchema } from '@/shared/utils/validation/record-fields.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { StockItemsService } from './stock-items.service.js';
import { createStockItemsController } from './stock-items.controller.js';
import {
  CreateStockItemDto,
  UpdateStockItemDto,
  listStockItemsQueryDto,
  stockItemsIdParamsDto,
} from './stock-items.dto.js';

/** Registers the `stock-items` routes (prefix `/api/v1/app`). */
export function stockItemsRoutes(service: StockItemsService): FastifyPluginAsync {
  const controller = createStockItemsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/stock-items',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List stock items',
          description:
            "Returns one page of the active organization's stock items (newest first by default), with the total count; `q` searches, filters narrow. Requires stock_item:read.",
          tags: ['Stock'],
          querystring: listStockItemsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get(
      '/stock-items/exports',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.LIST_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export stock items',
          description:
            'Returns the stock items the same filters and sort as the list would (every page, up to 5,000 rows) as a CSV file inside the JSON envelope (`file_name`, `content_type`, `row_count`, `is_truncated`, `content`). Requires `list:export` ("Export lists") and stock_item:read.',
          tags: ['Stock'],
          querystring: listStockItemsQueryDto,
        },
      },
      controller.export,
    );
    zodApplication.post(
      '/stock-items',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create stock item',
          description: 'Adds a stock item to the active organization. Requires stock_item:create.',
          tags: ['Stock'],
          body: CreateStockItemDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { stock_item_id: string } }>(
      '/stock-items/:stock_item_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get stock item',
          description:
            'Returns one stock item of the active organization. Requires stock_item:read.',
          tags: ['Stock'],
          params: stockItemsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<{ Params: { stock_item_id: string } }>(
      '/stock-items/:stock_item_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Update stock item',
          description:
            "Changes any of a stock item's fields; null clears an optional one. Send `expected_updated_at` (the `updated_at` you read) and a save over a newer change is a 409 naming who changed it (D43). Requires stock_item:update.",
          tags: ['Stock'],
          params: stockItemsIdParamsDto,
          body: UpdateStockItemDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<{ Params: { stock_item_id: string } }>(
      '/stock-items/:stock_item_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete stock item',
          description:
            "Soft-deletes a stock item with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Restorable until the organization's purge window ends (D38). Requires stock_item:delete.",
          tags: ['Stock'],
          params: stockItemsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<{ Params: { stock_item_id: string } }>(
      '/stock-items/:stock_item_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore stock item',
          description:
            "Undoes a stock item's delete. A live stock item is a 409. Requires stock_item:delete.",
          tags: ['Stock'],
          params: stockItemsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
