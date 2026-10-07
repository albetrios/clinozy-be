import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { MedicalSalesService } from './medical-sales.service.js';
import type { MedicalSaleOutput } from './medical-sales.types.js';

/** HTTP handlers for the `medical-sales` routes — {@link BaseRecordController} on {@link MedicalSalesService}. */
export class MedicalSalesController extends BaseRecordController<MedicalSaleOutput> {
  constructor(service: MedicalSalesService) {
    super(service, {
      resource: 'medical_sale',
      idParam: 'medical_sale_id',
      readPermission: APP_PERMISSIONS.MEDICAL_SALE_READ,
      exportName: 'medical-sales',
    });
  }
}

/** The `medical-sales` controller the routes register. */
export function createMedicalSalesController(service: MedicalSalesService): MedicalSalesController {
  return new MedicalSalesController(service);
}
