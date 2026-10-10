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

/** The by-id routes' path params. */
type StockVendorParams = { Params: { stock_vendor_id: string } };

/** Registers the `stock-vendors` routes (prefix `/api/v1/app`) — routes-final 9.E, routes 23–28. */
export function stockVendorsRoutes(service: StockVendorsService): FastifyPluginAsync {
  const controller = createStockVendorsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/stock-vendors',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List stock vendors',
          description:
            "Returns one page of the organization's stock vendors — the vendor picker and the Vendors tab — each with `payable` (the open dues of its live purchases) and `purchase_count` (its live purchases, paid or not); `meta.payable_total` is the open dues of every vendor the filters match (the footer, over every page). `q` searches the name; the created range narrows; sort `name` (default, A–Z), `created_at` or `payable` (most owed first by default). Requires stock_item:read.",
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
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_CREATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Add a stock vendor',
          description:
            "Adds a vendor the clinic buys consumables from — never the medical store's suppliers: `name*` (1–120, unique in any case — a 409 `record_already_exists`); optional `phone` (`+91` and ten digits), `is_quick` (true when a picker adds it inline). Requires stock_item:create.",
          tags: ['Stock'],
          body: CreateStockVendorDto,
        },
      },
      controller.create,
    );
    zodApplication.get<StockVendorParams>(
      '/stock-vendors/:stock_vendor_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a stock vendor',
          description:
            'Returns one stock vendor with its `payable` and `purchase_count`. Requires stock_item:read.',
          tags: ['Stock'],
          params: stockVendorsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.patch<StockVendorParams>(
      '/stock-vendors/:stock_vendor_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_UPDATE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Change a stock vendor',
          description:
            "Changes a vendor's `name` (unique — a 409 `record_already_exists`) or `phone` (null clears it). Send `expected_updated_at` and a save over a newer change is a 409 `record_changed`. Requires stock_item:update.",
          tags: ['Stock'],
          params: stockVendorsIdParamsDto,
          body: UpdateStockVendorDto,
        },
      },
      controller.update,
    );
    zodApplication.delete<StockVendorParams>(
      '/stock-vendors/:stock_vendor_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_DELETE)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Delete a stock vendor',
          description:
            "Deletes a vendor with nothing owed (a purchase of theirs not fully paid is a 409 `vendor_has_dues`), with why: `reason` (mistake, duplicate, not_needed, other) and a `note`, required for other. Its items keep pointing nowhere; its purchases keep it. Restorable until the organization's purge window ends. Requires stock_item:delete.",
          tags: ['Stock'],
          params: stockVendorsIdParamsDto,
          querystring: recordDeleteQuerySchema,
        },
      },
      controller.remove,
    );
    zodApplication.post<StockVendorParams>(
      '/stock-vendors/:stock_vendor_id/restore',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_DELETE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Restore a stock vendor',
          description:
            "Undoes a vendor's delete. A live one is a 409 `record_not_deleted`; its name taken meanwhile a 409 `record_restore_conflict`. Requires stock_item:delete.",
          tags: ['Stock'],
          params: stockVendorsIdParamsDto,
        },
      },
      controller.restore,
    );
  };
}
