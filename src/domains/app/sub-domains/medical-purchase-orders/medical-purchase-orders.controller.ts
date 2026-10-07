import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { MedicalPurchaseOrdersService } from './medical-purchase-orders.service.js';
import type { MedicalPurchaseOrderOutput } from './medical-purchase-orders.types.js';

/** HTTP handlers for the `medical-purchase-orders` routes — {@link BaseRecordController} on {@link MedicalPurchaseOrdersService}. */
export class MedicalPurchaseOrdersController extends BaseRecordController<MedicalPurchaseOrderOutput> {
  constructor(service: MedicalPurchaseOrdersService) {
    super(service, {
      resource: 'medical_purchase_order',
      idParam: 'medical_purchase_order_id',
      readPermission: APP_PERMISSIONS.MEDICAL_PURCHASE_ORDER_READ,
      exportName: 'medical-purchase-orders',
    });
  }
}

/** The `medical-purchase-orders` controller the routes register. */
export function createMedicalPurchaseOrdersController(
  service: MedicalPurchaseOrdersService,
): MedicalPurchaseOrdersController {
  return new MedicalPurchaseOrdersController(service);
}
