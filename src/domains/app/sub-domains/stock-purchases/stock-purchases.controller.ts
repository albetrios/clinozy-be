import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { StockPurchasesService } from './stock-purchases.service.js';
import type { StockPurchaseOutput } from './stock-purchases.types.js';

/** HTTP handlers for the `stock-purchases` routes — {@link BaseRecordController} on {@link StockPurchasesService}. */
export class StockPurchasesController extends BaseRecordController<StockPurchaseOutput> {
  constructor(service: StockPurchasesService) {
    super(service, {
      resource: 'stock_purchase',
      idParam: 'stock_purchase_id',
      readPermission: APP_PERMISSIONS.STOCK_PURCHASE_READ,
      exportName: 'stock-purchases',
    });
  }
}

/** The `stock-purchases` controller the routes register. */
export function createStockPurchasesController(
  service: StockPurchasesService,
): StockPurchasesController {
  return new StockPurchasesController(service);
}
