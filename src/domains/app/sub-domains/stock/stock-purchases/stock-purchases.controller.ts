import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { StockPurchasesService } from './stock-purchases.service.js';
import type { StockPurchaseOutput } from './stock-purchases.types.js';

/**
 * HTTP handlers for the `stock-purchases` routes — {@link BaseRecordController} on
 * {@link StockPurchasesService}; "Paid" is a payment, so it needs `payment:create` (S11); the
 * export answers the list as CSV (S2).
 */
export class StockPurchasesController extends BaseRecordController<StockPurchaseOutput> {
  constructor(service: StockPurchasesService) {
    super(service, {
      resource: 'stock_purchase',
      idParam: 'stock_purchase_id',
      guardedFields: { payment: APP_PERMISSIONS.PAYMENT_CREATE },
      readPermission: APP_PERMISSIONS.STOCK_ITEM_READ,
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
