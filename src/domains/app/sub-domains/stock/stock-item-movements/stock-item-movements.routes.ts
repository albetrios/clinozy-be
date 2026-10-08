import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { StockItemMovementsService } from './stock-item-movements.service.js';
import { createStockItemMovementsController } from './stock-item-movements.controller.js';
import {
  CreateStockItemMovementDto,
  RevertStockItemMovementDto,
  listItemStockItemMovementsQueryDto,
  listStockItemMovementsQueryDto,
  stockItemMovementsIdParamsDto,
  stockItemMovementsParentParamsDto,
} from './stock-item-movements.dto.js';

/** The nested routes' path params — the item. */
type StockItemParams = { Params: { stock_item_id: string } };
/** The by-id routes' path params — the item and its movement. */
type StockItemMovementParams = {
  Params: { stock_item_id: string; stock_item_movement_id: string };
};

/**
 * Registers the movement routes (prefix `/api/v1/app`) — routes-final 9.B, routes 8–12: the
 * Movements tab, and an item's movements under it.
 */
export function stockItemMovementsRoutes(service: StockItemMovementsService): FastifyPluginAsync {
  const controller = createStockItemMovementsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/stock-item-movements',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List stock movements',
          description:
            "Returns one page of every change to the organization's stock — the Movements tab, newest first — each with its signed `quantity_change`, the `quantity_after` it left, what made it (`patient_treatment_id`, `stock_purchase_id`, `stock_count_id`, `reverts_stock_item_movement_id`) and `reverted_by_stock_item_movement_id`. Filters `stock_item_id`, `type` (several, comma-separated — `opening` · `received` · `used` · `damaged` · `returned` · `adjust` · `reverted`), `patient_treatment_id` (a session's stock), `author_membership_id`, the created range. Requires stock_item:read.",
          tags: ['Stock'],
          querystring: listStockItemMovementsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.get<StockItemParams>(
      '/stock-items/:stock_item_id/movements',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: "List a stock item's movements",
          description:
            "Returns one page of an item's history, newest first — the same filters as the Movements tab but the item. An item not in the organization is a 404. Requires stock_item:read.",
          tags: ['Stock'],
          params: stockItemMovementsParentParamsDto,
          querystring: listItemStockItemMovementsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post<StockItemParams>(
      '/stock-items/:stock_item_id/movements',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Move stock',
          description:
            "Uses, receives, damages, returns or adjusts an item's stock: `type*` (`used` · `received` · `damaged` · `returned` · `adjust`) and `quantity*` — how much (more than 0; the server signs it by the type), or for `adjust` the counted quantity (0 or more — the server writes the difference; equal to the stock is a 400 `quantity`); `used_for` (≤ 80) and `patient_treatment_id` (the session the stock went into — not found or reversed, a 400) only on `used`; optional `note` (≤ 280). The item's quantity moves in the same transaction; below zero is a 409 `not_enough_stock`. The caller is its author. Requires stock_item:update.",
          tags: ['Stock'],
          params: stockItemMovementsParentParamsDto,
          body: CreateStockItemMovementDto,
        },
      },
      controller.create,
    );
    zodApplication.get<StockItemMovementParams>(
      '/stock-items/:stock_item_id/movements/:stock_item_movement_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get a stock movement',
          description:
            "Returns one movement of the item — another item's is a 404. Requires stock_item:read.",
          tags: ['Stock'],
          params: stockItemMovementsIdParamsDto,
        },
      },
      controller.get,
    );
    zodApplication.post<StockItemMovementParams>(
      '/stock-items/:stock_item_id/movements/:stock_item_movement_id/revert',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Revert a stock movement',
          description:
            'Undoes a movement with why — `reason*` (`mistake` · `wrong_item` · `wrong_quantity` · `other`) and `note` (required for other): writes a `reverted` movement of the opposite change pointing at it, so the history keeps both (the toast\'s "Undo"). Once per movement, never on a revert itself — a 409 `already_reverted`; taking the quantity below zero, a 409 `not_enough_stock`. Answers with the revert. Requires stock_item:update.',
          tags: ['Stock'],
          params: stockItemMovementsIdParamsDto,
          body: RevertStockItemMovementDto,
        },
      },
      controller.transition('revert'),
    );
  };
}
