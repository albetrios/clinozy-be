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

/** The by-id routes' path params. */
type StockPurchaseParams = { Params: { stock_purchase_id: string } };

/** Registers the `stock-purchases` routes (prefix `/api/v1/app`) — routes-final 9.D, routes 16–22. */
export function stockPurchasesRoutes(service: StockPurchasesService): FastifyPluginAsync {
  const controller = createStockPurchasesController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/stock-purchases',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List stock purchases',
          description:
            "Returns one page of the organization's vendor bills for clinic stock — the Purchases tab — each with its `items`, `bill_amount`, `paid_amount`, `due_amount`, `payment_status` (`paid` · `partial` · `unpaid`) and `payment_ids`; `meta.due_total` is the open dues of every purchase the filters match (the footer). `q` is the bill number, the vendor's name or the number (`#16`); filters `stock_vendor_id`, `payment_status` (several, comma-separated), `purchase_date_from` / `purchase_date_to` (inclusive), the created range; sort `purchase_date` (default, newest first), `stock_purchase_number`, `bill_amount`, `due_amount` or `created_at`. Requires stock_item:read.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_EXPORT)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Export stock purchases',
          description:
            'Returns the stock purchases the same filters and sort as the list would (every page, up to 5,000 rows; `limit` and `after` ignored) as a CSV file inside the JSON envelope (`file_name` `stock-purchases-YYYY-MM-DD.csv`, `content_type`, `row_count`, `is_truncated`, `content`). Requires stock_item:export and stock_item:read.',
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Record a stock purchase',
          description:
            'Records a vendor bill and receives what arrived: `stock_vendor_id*`, `items*` (1–50 lines — a listed `stock_item_id`, or `new_item` {`name*`, `unit`} to add one as typed (an item of that name is used), `quantity*` more than 0, `rate*`; an unknown item is a 400 `items`); optional `bill_number` (≤ 30), `purchase_date` (default today, never in the future), `bill_amount` (default the lines\' total — each quantity × rate), `payment` — the drawer\'s "Paid": `branch_id*` (one of yours), `splits*` (cash · UPI · card), optional `paid_at` (an open day), `reference` — recorded as a supplier-bill payment to the vendor (needs payment:create; above the bill, a 409 `more_than_due`). Each line writes a `received` movement and sets the item\'s `last_rate`. Answers with the purchase as its "Paid" left it. Requires stock_item:create.',
          tags: ['Stock'],
          body: CreateStockPurchaseDto,
        },
      },
      controller.create,
    );
    zodApplication.get<StockPurchaseParams>(
      '/stock-purchases/:stock_purchase_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a stock purchase',
          description:
            'Returns one stock purchase with its lines, what is paid and owed, and its payments. Requires stock_item:read.',
          tags: ['Stock'],
          params: stockPurchasesIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<StockPurchaseParams>(
      '/stock-purchases/:stock_purchase_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a stock purchase',
          description:
            'Changes the bill details: `stock_vendor_id`, `bill_number` (null clears it), `purchase_date` (never in the future), `bill_amount` (never below what is paid — a 400). The lines are fixed once saved — `items` is a 409 `purchase_received`. Send `expected_updated_at` and a save over a newer change is a 409 `record_changed`. Requires stock_item:update.',
          tags: ['Stock'],
          params: stockPurchasesIdParamsDto,
          body: UpdateStockPurchaseDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<StockPurchaseParams>(
      '/stock-purchases/:stock_purchase_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a stock purchase',
          description:
            "Deletes an unpaid purchase (anything paid is a 409 `purchase_paid`) with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. What it received is taken back with `reverted` movements — some used since is a 409 `not_enough_stock`. Restorable until the organization's purge window ends. Requires stock_item:delete.",
          tags: ['Stock'],
          params: stockPurchasesIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<StockPurchaseParams>(
      '/stock-purchases/:stock_purchase_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a stock purchase',
          description:
            "Undoes a purchase's delete and receives its lines again (`received` movements). A live one is a 409 `record_not_deleted`. Requires stock_item:delete.",
          tags: ['Stock'],
          params: stockPurchasesIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
