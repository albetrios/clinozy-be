import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type {
  BaseRecordListResult,
  BaseRecordVisibility,
} from '@/domains/app/base-record.types.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { invoice_credit_notes } from '@/domains/app/sub-domains/billing/invoice-credit-notes/invoice-credit-notes.schema.js';
import { pending_credits } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.schema.js';
import { stock_purchases } from '@/domains/app/sub-domains/stock/stock-purchases/stock-purchases.schema.js';
import { medical_purchase_orders } from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.schema.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { listPaymentEditsQueryDto } from './payments.dto.js';
import type { PaymentsRepository } from './payments.repository.js';
import { createPaymentsRules } from './payments.rules.js';
import { payments } from './payments.schema.js';
import { serializePayment, serializePaymentEdit } from './payments.serializer.js';
import type { PaymentEditOutput, PaymentOutput } from './payments.types.js';
import {
  validateCreatePayment,
  validateListPaymentsQuery,
  validateUpdatePayment,
} from './payments.validator.js';

/**
 * The organization's money in and out (launch ROUTE #136, routes-final 8.C): the ledger and its
 * export, receive and pay, read, change on an open day (recorded), what changed, reverse a settled
 * payment, delete and restore on an open day.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.payments`, branch-scoped (B4 —
 *   `branch:read` sees every branch); the branch, contact, invoice, credit note, pending credit and
 *   reversed payment are references. The rules hold the kinds, the splits, the day lock and the
 *   money each write moves (B17–B21). Reading needs `payment:read`, receiving and paying
 *   `payment:create`, changing `payment:update`, deleting, restoring and reversing
 *   `payment:delete`, the export `payment:export` (the routes' gates, B2).
 * - **Failure modes:** `NotFoundError('Payment')`; `ValidationError` for a bad body or query, a
 *   reference that is no live record here, or a kind's missing field; `ConflictError` per the
 *   rules, a stale save or a restore of a live payment.
 */
export class PaymentsService extends BaseRecordService<PaymentOutput> {
  constructor(
    organizationService: OrganizationService,
    private readonly paymentsRepository: PaymentsRepository,
  ) {
    super(organizationService, {
      label: 'Payment',
      repository: paymentsRepository,
      parseCreate: validateCreatePayment,
      parseUpdate: validateUpdatePayment,
      parseList: validateListPaymentsQuery,
      serialize: serializePayment,
      references: [
        { field: 'branch_id', table: branches, label: 'branch' },
        { field: 'contact_id', table: contacts, label: 'contact' },
        { field: 'invoice_id', table: invoices, label: 'invoice' },
        { field: 'invoice_credit_note_id', table: invoice_credit_notes, label: 'credit note' },
        { field: 'pending_credit_id', table: pending_credits, label: 'pending credit' },
        { field: 'reverses_payment_id', table: payments, label: 'payment' },
        { field: 'stock_purchase_id', table: stock_purchases, label: 'stock purchase' },
        {
          field: 'medical_purchase_order_id',
          table: medical_purchase_orders,
          label: 'medical purchase order',
        },
      ],
      branchColumn: 'branch_id',
      ...createPaymentsRules(paymentsRepository),
    });
  }

  /**
   * B20: one page of a payment's recorded changes, newest first (`after` = the last edit's id).
   *
   * @remarks
   * - **Failure modes:** `NotFoundError('Payment')` — not here, or another branch without
   *   `branch:read`; `ValidationError` for a bad query.
   */
  async listEdits({
    scope,
    paymentPublicId,
    query,
    options,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    paymentPublicId: string;
    query: unknown;
    options: { actingUserPublicId?: string | undefined; visibility?: BaseRecordVisibility };
  }): Promise<BaseRecordListResult<PaymentEditOutput>> {
    const { limit, after } = parseWithSchema({
      schema: listPaymentEditsQueryDto,
      data: query ?? {},
    });
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organizationId = await this.organizationId(scope);
        const userId = await this.userId(options.actingUserPublicId);
        const payment = await this.requireRow({
          organizationId,
          publicId: paymentPublicId,
          userId,
          visibility: options.visibility,
        });
        const afterId =
          after === undefined ? undefined : await this.paymentsRepository.findEditId(after);
        const rows = await this.paymentsRepository.listEdits({
          paymentId: payment.id,
          limit: limit + 1,
          after: afterId,
        });
        const page = rows.slice(0, limit);
        const hasMore = rows.length > limit;
        return {
          items: page.map(serializePaymentEdit),
          total: null,
          limit,
          has_more: hasMore,
          next_cursor: hasMore ? (page.at(-1)?.id ?? null) : null,
        };
      },
    });
  }
}
