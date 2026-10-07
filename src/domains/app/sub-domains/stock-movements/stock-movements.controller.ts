import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { StockMovementsService } from './stock-movements.service.js';
import type { StockMovementOutput } from './stock-movements.types.js';

/** HTTP handlers for the `stock-movements` routes — {@link BaseRecordController} on {@link StockMovementsService}. */
export class StockMovementsController extends BaseRecordController<StockMovementOutput> {
  constructor(service: StockMovementsService) {
    super(service, { resource: 'stock_movement', idParam: 'stock_movement_id' });
  }
}

/** The `stock-movements` controller the routes register. */
export function createStockMovementsController(
  service: StockMovementsService,
): StockMovementsController {
  return new StockMovementsController(service);
}
