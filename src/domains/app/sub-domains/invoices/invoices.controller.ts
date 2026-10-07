import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { InvoicesService } from './invoices.service.js';
import type { InvoiceOutput } from './invoices.types.js';

/** HTTP handlers for the `invoices` routes — {@link BaseRecordController} on {@link InvoicesService}. */
export class InvoicesController extends BaseRecordController<InvoiceOutput> {
  constructor(service: InvoicesService) {
    super(service, {
      resource: 'invoice',
      idParam: 'invoice_id',
      readPermission: APP_PERMISSIONS.INVOICE_READ,
      exportName: 'invoices',
    });
  }
}

/** The `invoices` controller the routes register. */
export function createInvoicesController(service: InvoicesService): InvoicesController {
  return new InvoicesController(service);
}
