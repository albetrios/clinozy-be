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

/** The by-id routes' path params. */
type StockItemParams = { Params: { stock_item_id: string } };

/** Registers the `stock-items` routes (prefix `/api/v1/app`) — routes-final 9.A, routes 1–7. */
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
            'Returns one page of the organization\'s consumables and equipment — the Items tab — each with its `quantity`, `stock_level` (`ok` · `low` — at or under the minimum · `out` — 0) and `lasts_days` (the whole days it lasts at the weekly usage; null without usage). `q` is the name or the number (`#167`); filters `category` and `stock_level` (several, comma-separated — `stock_level=low` fills "Reorder low items"), `stock_vendor_id`, `lasts_days_to` (a whole number of days, 1–3650 — the items that last at most that long, `7` = runs out within a week; an item without a weekly usage never matches), the created range; sort `name` (default, A–Z), `stock_item_number`, `category`, `quantity`, `lasts_days` (none last) or `created_at`. Requires stock_item:read.',
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export stock items',
          description:
            'Returns the stock items the same filters and sort as the list would (every page, up to 5,000 rows; `limit` and `after` ignored) as a CSV file inside the JSON envelope (`file_name` `stock-items-YYYY-MM-DD.csv`, `content_type`, `row_count`, `is_truncated`, `content`). Requires stock_item:export and stock_item:read.',
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
          summary: 'Add a stock item',
          description:
            'Adds a consumable or piece of equipment: `name*` (1–120, unique in any case — a 409 `record_already_exists`); optional `category` (`creams_serums` · `peels` · `masks` · `consumables` default · `equipment` · `other`), `unit` (default `piece`), `size_per_unit` (more than 0) with its `measure_unit` (`ml` · `g` · `pcs` · `units` — both or neither, a 400), `min_quantity` (default 1), `max_quantity` (default 10, never under the minimum — a 400), `usage_per_week`, `stock_vendor_id`, `opening_quantity` (written as an `opening` movement — the quantity moves only with movements). Quantities are decimals with up to three places. Answers with the item as its opening left it. Requires stock_item:create.',
          tags: ['Stock'],
          body: CreateStockItemDto,
        },
      },
      controller.create,
    );
    zodApplication.get<StockItemParams>(
      '/stock-items/:stock_item_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a stock item',
          description:
            'Returns one stock item with its quantity, level and how long it lasts. Requires stock_item:read.',
          tags: ['Stock'],
          params: stockItemsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<StockItemParams>(
      '/stock-items/:stock_item_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a stock item',
          description:
            'Changes any field of the create but `opening_quantity`, checked the same way (null clears an optional one) — never its quantity (a movement or a count moves it) nor `last_rate` (the latest purchase sets it). Send `expected_updated_at` and a save over a newer change is a 409 `record_changed`. Requires stock_item:update.',
          tags: ['Stock'],
          params: stockItemsIdParamsDto,
          body: UpdateStockItemDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<StockItemParams>(
      '/stock-items/:stock_item_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a stock item',
          description:
            "Deletes an item at zero — any left is a 409 `item_has_stock` (write it off first) — with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Its movements stay. Restorable until the organization's purge window ends. Requires stock_item:delete.",
          tags: ['Stock'],
          params: stockItemsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<StockItemParams>(
      '/stock-items/:stock_item_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a stock item',
          description:
            "Undoes an item's delete. A live one is a 409 `record_not_deleted`; its name taken meanwhile a 409 `record_restore_conflict`. Requires stock_item:delete.",
          tags: ['Stock'],
          params: stockItemsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
