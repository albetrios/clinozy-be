import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { SupplierCreditsService } from './supplier-credits.service.js';
import type { SupplierCreditOutput } from './supplier-credits.types.js';

/** HTTP handlers for the `supplier-credits` routes — {@link BaseRecordController} on {@link SupplierCreditsService}. */
export class SupplierCreditsController extends BaseRecordController<SupplierCreditOutput> {
  constructor(service: SupplierCreditsService) {
    super(service, { resource: 'supplier_credit', idParam: 'supplier_credit_id' });
  }
}

/** The `supplier-credits` controller the routes register. */
export function createSupplierCreditsController(
  service: SupplierCreditsService,
): SupplierCreditsController {
  return new SupplierCreditsController(service);
}
