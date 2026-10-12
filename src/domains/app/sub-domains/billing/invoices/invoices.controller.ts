import type { FastifyReply, FastifyRequest } from 'fastify';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import {
  getRequestIdentifier,
  requireOrganizationScope,
} from '@/shared/utils/http/request.util.js';
import { successResponse } from '@/shared/utils/http/response.util.js';
import type { InvoicesService } from './invoices.service.js';
import type { InvoiceOutput } from './invoices.types.js';

/** HTTP handlers for the `invoices` routes — {@link BaseRecordController} on {@link InvoicesService}. */
export class InvoicesController extends BaseRecordController<InvoiceOutput> {
  constructor(private readonly invoicesService: InvoicesService) {
    super(invoicesService, {
      resource: 'invoice',
      idParam: 'invoice_id',
      readPermission: APP_PERMISSIONS.PAYMENT_READ,
      exportName: 'invoices',
    });
  }

  /** `POST /invoices/preview` — what a bill would come to; nothing is written, so nothing is audited (D81). */
  readonly preview = async (request: FastifyRequest, _reply: FastifyReply) => {
    const data = await this.invoicesService.preview({
      scope: requireOrganizationScope(request),
      body: request.body,
      options: {
        actingUserPublicId: this.actor(request),
        visibility: await this.visibility(request),
      },
    });
    return successResponse({ data, request_id: getRequestIdentifier(request) });
  };

  /** `POST /invoices/{invoice_id}/preview` — what a change would come to; nothing is written (D81). */
  readonly previewChange = async (request: FastifyRequest, _reply: FastifyReply) => {
    const data = await this.invoicesService.previewChange({
      scope: requireOrganizationScope(request),
      publicId: this.readId(request),
      body: request.body,
      options: {
        actingUserPublicId: this.actor(request),
        visibility: await this.visibility(request),
      },
    });
    return successResponse({ data, request_id: getRequestIdentifier(request) });
  };
}

/** The `invoices` controller the routes register. */
export function createInvoicesController(service: InvoicesService): InvoicesController {
  return new InvoicesController(service);
}
