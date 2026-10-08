import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PaymentsService } from '@/domains/app/sub-domains/billing/payments/payments.service.js';
import type { PaymentOutput } from '@/domains/app/sub-domains/billing/payments/payments.types.js';
import type { MedicalSalesService } from './medical-sales.service.js';
import type { MedicalSaleOutput } from './medical-sales.types.js';

/** HTTP handlers for the `medical-sales` routes — {@link BaseRecordController} on {@link MedicalSalesService}. */
export class MedicalSalesController extends BaseRecordController<MedicalSaleOutput> {
  constructor(service: MedicalSalesService) {
    super(service, {
      resource: 'medical_sale',
      idParam: 'medical_sale_id',
      readPermission: APP_PERMISSIONS.MEDICINE_READ,
      exportName: 'medical-sales',
      guardedFields: { payment: APP_PERMISSIONS.PAYMENT_CREATE },
    });
  }
}

/** The `medical-sales` controller the routes register. */
export function createMedicalSalesController(service: MedicalSalesService): MedicalSalesController {
  return new MedicalSalesController(service);
}

/**
 * The store's Payments tab (MD22) — the payments ledger's list limited to the medical store
 * (`is_medical_store`), gated by `medicine:read` on its route.
 */
export function createMedicalPaymentsController(
  service: PaymentsService,
): BaseRecordController<PaymentOutput> {
  return new BaseRecordController<PaymentOutput>(service, {
    resource: 'payment',
    idParam: 'payment_id',
    readPermission: APP_PERMISSIONS.MEDICINE_READ,
    listDerived: { is_medical_store: true },
  });
}
