import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { StockVendorsService } from './stock-vendors.service.js';
import type { StockVendorOutput } from './stock-vendors.types.js';

/** HTTP handlers for the `stock-vendors` routes — {@link BaseRecordController} on {@link StockVendorsService}. */
export class StockVendorsController extends BaseRecordController<StockVendorOutput> {
  constructor(service: StockVendorsService) {
    super(service, { resource: 'stock_vendor', idParam: 'stock_vendor_id' });
  }
}

/** The `stock-vendors` controller the routes register. */
export function createStockVendorsController(service: StockVendorsService): StockVendorsController {
  return new StockVendorsController(service);
}
