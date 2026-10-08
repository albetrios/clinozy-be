import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { StockCountsService } from './stock-counts.service.js';
import { createStockCountsController } from './stock-counts.controller.js';
import {
  CreateStockCountDto,
  listStockCountsQueryDto,
  stockCountsIdParamsDto,
} from './stock-counts.dto.js';

/** The by-id route's path params. */
type StockCountParams = { Params: { stock_count_id: string } };

/** Registers the `stock-counts` routes (prefix `/api/v1/app`) — routes-final 9.C, routes 13–15. */
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
            "Returns one page of the organization's past stock checks, each with its `lines` (`stock_item_id`, `system_quantity`, `counted_quantity`, `difference`) and `changed_item_count`. Filters `counted_from` / `counted_to` (`to` exclusive); sort `counted_at` (default, newest first) or `created_at`. Requires stock_item:read.",
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
          summary: 'Save a stock count',
          description:
            'Saves a stock check: `lines*` — 1–500 counted items (`stock_item_id*`, `counted_quantity*` 0 or more), each item once; an unknown or deleted item, or nothing that differs, is a 400 `lines`. The server takes each item\'s quantity as the system quantity and moves each differing item to its counted quantity with an `adjust` movement noted "Stock check". The caller is its author. A count is never changed or deleted — a wrong one is followed by another count or a revert. Requires stock_item:update.',
          tags: ['Stock'],
          body: CreateStockCountDto,
        },
      },
      controller.create,
    );
    zodApplication.get<StockCountParams>(
      '/stock-counts/:stock_count_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a stock count',
          description: 'Returns one stock check with its lines. Requires stock_item:read.',
          tags: ['Stock'],
          params: stockCountsIdParamsDto,
        },
      },
      controller.get,
    );
  };
}
