import type { FastifyReply, FastifyRequest } from 'fastify';
import { paginatedResponse } from '@/shared/utils/http/response.util.js';
import {
  getRequestIdentifier,
  requireOrganizationScope,
} from '@/shared/utils/http/request.util.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PaymentsService } from './payments.service.js';
import type { PaymentOutput } from './payments.types.js';

/** HTTP handlers for the `payments` routes — {@link BaseRecordController} on {@link PaymentsService}. */
export class PaymentsController extends BaseRecordController<PaymentOutput> {
  constructor(private readonly paymentsService: PaymentsService) {
    super(paymentsService, {
      resource: 'payment',
      idParam: 'payment_id',
      readPermission: APP_PERMISSIONS.PAYMENT_READ,
      exportName: 'payments',
    });
  }

  /** `GET /payments/{payment_id}/edits` — one page of what changed (B20). */
  readonly edits = async (request: FastifyRequest, _reply: FastifyReply) => {
    const page = await this.paymentsService.listEdits({
      scope: requireOrganizationScope(request),
      paymentPublicId: this.readId(request),
      query: request.query,
      options: {
        actingUserPublicId: this.actor(request),
        visibility: await this.visibility(request),
      },
    });
    return paginatedResponse({
      data: page.items,
      request_id: getRequestIdentifier(request),
      pagination: {
        per_page: page.limit,
        next: page.next_cursor,
        has_more: page.has_more,
      },
    });
  };
}

/** The `payments` controller the routes register. */
export function createPaymentsController(service: PaymentsService): PaymentsController {
  return new PaymentsController(service);
}
