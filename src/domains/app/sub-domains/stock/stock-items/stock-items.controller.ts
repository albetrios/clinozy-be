import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { StockItemsService } from './stock-items.service.js';
import type { StockItemOutput } from './stock-items.types.js';

/**
 * HTTP handlers for the `stock-items` routes — {@link BaseRecordController} on
 * {@link StockItemsService}; the export answers the list as CSV (S2).
 */
export class StockItemsController extends BaseRecordController<StockItemOutput> {
  constructor(service: StockItemsService) {
    super(service, {
      resource: 'stock_item',
      idParam: 'stock_item_id',
      readPermission: APP_PERMISSIONS.STOCK_ITEM_READ,
      exportName: 'stock-items',
    });
  }
}

/** The `stock-items` controller the routes register. */
export function createStockItemsController(service: StockItemsService): StockItemsController {
  return new StockItemsController(service);
}
