import type { FastifyPluginAsync } from 'fastify';
import type { StockServices } from './stock.container.js';
import { stockCountsRoutes } from './stock-counts/stock-counts.routes.js';
import { stockItemMovementsRoutes } from './stock-item-movements/stock-item-movements.routes.js';
import { stockItemsRoutes } from './stock-items/stock-items.routes.js';
import { stockPurchasesRoutes } from './stock-purchases/stock-purchases.routes.js';
import { stockVendorsRoutes } from './stock-vendors/stock-vendors.routes.js';

/**
 * Registers the clinic stock routes (prefix `/api/v1/app`) — routes-final 9, routes 1–28: items,
 * their movements, counts, purchases and vendors.
 */
export function stockRoutes(services: StockServices): FastifyPluginAsync {
  return async (app) => {
    await app.register(stockItemsRoutes(services.stockItemsService));
    await app.register(stockItemMovementsRoutes(services.stockItemMovementsService));
    await app.register(stockCountsRoutes(services.stockCountsService));
    await app.register(stockPurchasesRoutes(services.stockPurchasesService));
    await app.register(stockVendorsRoutes(services.stockVendorsService));
  };
}
