import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { StockCountsService } from './stock-counts.service.js';
import type { StockCountOutput } from './stock-counts.types.js';

/** HTTP handlers for the `stock-counts` routes — {@link BaseRecordController} on {@link StockCountsService}. */
export class StockCountsController extends BaseRecordController<StockCountOutput> {
  constructor(service: StockCountsService) {
    super(service, {
      resource: 'stock_count',
      idParam: 'stock_count_id',
      readPermission: APP_PERMISSIONS.STOCK_ITEM_READ,
    });
  }
}

/** The `stock-counts` controller the routes register. */
export function createStockCountsController(service: StockCountsService): StockCountsController {
  return new StockCountsController(service);
}
