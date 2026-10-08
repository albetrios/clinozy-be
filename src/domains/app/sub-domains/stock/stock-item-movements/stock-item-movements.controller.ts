import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { StockItemMovementsService } from './stock-item-movements.service.js';
import type { StockItemMovementOutput } from './stock-item-movements.types.js';

/**
 * HTTP handlers for the movement routes — {@link BaseRecordController} on
 * {@link StockItemMovementsService}, listed on their own and under their item.
 */
export class StockItemMovementsController extends BaseRecordController<StockItemMovementOutput> {
  constructor(service: StockItemMovementsService) {
    super(service, {
      resource: 'stock_item_movement',
      idParam: 'stock_item_movement_id',
      parentParam: 'stock_item_id',
      readPermission: APP_PERMISSIONS.STOCK_ITEM_READ,
    });
  }
}

/** The movement controller the routes register. */
export function createStockItemMovementsController(
  service: StockItemMovementsService,
): StockItemMovementsController {
  return new StockItemMovementsController(service);
}
