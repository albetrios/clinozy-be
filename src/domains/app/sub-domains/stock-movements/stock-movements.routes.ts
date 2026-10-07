import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT } from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import type { StockMovementsService } from './stock-movements.service.js';
import { createStockMovementsController } from './stock-movements.controller.js';
import {
  CreateStockMovementDto,
  listStockMovementsQueryDto,
  stockMovementsIdParamsDto,
} from './stock-movements.dto.js';

/** Registers the `stock-movements` routes (prefix `/api/v1/app`). */
export function stockMovementsRoutes(service: StockMovementsService): FastifyPluginAsync {
  const controller = createStockMovementsController(service);

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/stock-movements',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'List stock movements',
          description:
            "Returns one page of the active organization's stock movements (newest first by default), with the total count; `q` searches, filters narrow. Requires stock_item:read.",
          tags: ['Stock'],
          querystring: listStockMovementsQueryDto,
        },
      },
      controller.list,
    );
    zodApplication.post(
      '/stock-movements',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_UPDATE)],
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        schema: {
          summary: 'Create stock movement',
          description:
            'Adds a stock movement to the active organization. Requires stock_item:update.',
          tags: ['Stock'],
          body: CreateStockMovementDto,
        },
      },
      controller.create,
    );
    zodApplication.get<{ Params: { stock_movement_id: string } }>(
      '/stock-movements/:stock_movement_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(APP_PERMISSIONS.STOCK_ITEM_READ)],
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        schema: {
          summary: 'Get stock movement',
          description:
            'Returns one stock movement of the active organization. Requires stock_item:read.',
          tags: ['Stock'],
          params: stockMovementsIdParamsDto,
        },
      },
      controller.get,
    );
  };
}
