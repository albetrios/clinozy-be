import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { StockCountsRepository } from './stock-counts/stock-counts.repository.js';
import { StockCountsService } from './stock-counts/stock-counts.service.js';
import { StockItemMovementsRepository } from './stock-item-movements/stock-item-movements.repository.js';
import { StockItemMovementsService } from './stock-item-movements/stock-item-movements.service.js';
import { StockItemsRepository } from './stock-items/stock-items.repository.js';
import { StockItemsService } from './stock-items/stock-items.service.js';
import { StockPurchasesRepository } from './stock-purchases/stock-purchases.repository.js';
import { StockPurchasesService } from './stock-purchases/stock-purchases.service.js';
import { StockVendorsRepository } from './stock-vendors/stock-vendors.repository.js';
import { StockVendorsService } from './stock-vendors/stock-vendors.service.js';

/** The clinic stock services (launch ROUTE #137, routes-final 9): one per nested sub-domain. */
export type StockServices = {
  stockItemsService: StockItemsService;
  stockItemMovementsService: StockItemMovementsService;
  stockCountsService: StockCountsService;
  stockPurchasesService: StockPurchasesService;
  stockVendorsService: StockVendorsService;
};

/**
 * Builds the clinic stock services on their repositories — items, movements, counts, purchases
 * and vendors (routes-final 9.A–9.E).
 *
 * @remarks
 * - **Algorithm:** one repository per service; every writer moves an item's balance through the
 *   movement ledger (S5).
 */
export function createStockServices(organizationService: OrganizationService): StockServices {
  return {
    stockItemsService: new StockItemsService(organizationService, new StockItemsRepository()),
    stockItemMovementsService: new StockItemMovementsService(
      organizationService,
      new StockItemMovementsRepository(),
    ),
    stockCountsService: new StockCountsService(organizationService, new StockCountsRepository()),
    stockPurchasesService: new StockPurchasesService(
      organizationService,
      new StockPurchasesRepository(),
    ),
    stockVendorsService: new StockVendorsService(organizationService, new StockVendorsRepository()),
  };
}
