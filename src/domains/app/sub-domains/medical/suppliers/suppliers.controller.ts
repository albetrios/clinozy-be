import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { SuppliersService } from './suppliers.service.js';
import type { SupplierOutput } from './suppliers.types.js';

/** HTTP handlers for the `suppliers` routes — {@link BaseRecordController} on {@link SuppliersService}. */
export class SuppliersController extends BaseRecordController<SupplierOutput> {
  constructor(service: SuppliersService) {
    super(service, {
      resource: 'supplier',
      idParam: 'supplier_id',
      readPermission: APP_PERMISSIONS.MEDICINE_READ,
    });
  }
}

/** The `suppliers` controller the routes register. */
export function createSuppliersController(service: SuppliersService): SuppliersController {
  return new SuppliersController(service);
}
