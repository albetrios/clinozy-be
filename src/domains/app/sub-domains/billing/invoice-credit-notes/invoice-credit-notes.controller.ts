import type { FastifyRequest } from 'fastify';
import { hasOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import type { InvoiceCreditNotesService } from './invoice-credit-notes.service.js';
import type { InvoiceCreditNoteOutput } from './invoice-credit-notes.types.js';

/** HTTP handlers for the credit-note routes — {@link BaseRecordController} on {@link InvoiceCreditNotesService}. */
export class InvoiceCreditNotesController extends BaseRecordController<InvoiceCreditNoteOutput> {
  constructor(service: InvoiceCreditNotesService) {
    super(service, {
      resource: 'invoice_credit_note',
      idParam: 'invoice_credit_note_id',
      parentParam: 'invoice_id',
      readPermission: APP_PERMISSIONS.PAYMENT_READ,
    });
  }

  /** B4: a credit note's branch is its invoice's — every branch only with `branch:read`. */
  protected override async visibility(request: FastifyRequest): Promise<BaseRecordVisibility> {
    return {
      ...(await super.visibility(request)),
      allBranches: await hasOrganizationPermission({
        request,
        permissionCode: APP_PERMISSIONS.BRANCH_READ,
      }),
    };
  }
}

/** The credit-note controller the routes register. */
export function createInvoiceCreditNotesController(
  service: InvoiceCreditNotesService,
): InvoiceCreditNotesController {
  return new InvoiceCreditNotesController(service);
}
