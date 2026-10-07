import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PaymentsService } from './payments.service.js';
import type { PaymentOutput } from './payments.types.js';

/** HTTP handlers for the `payments` routes — {@link BaseRecordController} on {@link PaymentsService}. */
export class PaymentsController extends BaseRecordController<PaymentOutput> {
  constructor(service: PaymentsService) {
    super(service, {
      resource: 'payment',
      idParam: 'payment_id',
      readPermission: APP_PERMISSIONS.PAYMENT_READ,
      exportName: 'payments',
    });
  }
}

/** The `payments` controller the routes register. */
export function createPaymentsController(service: PaymentsService): PaymentsController {
  return new PaymentsController(service);
}
