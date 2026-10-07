import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { ValidationError } from '@/shared/errors/index.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { credit_notes } from '@/domains/app/sub-domains/credit-notes/credit-notes.schema.js';
import { day_closes } from '@/domains/app/sub-domains/day-closes/day-closes.schema.js';
import { invoices } from '@/domains/app/sub-domains/invoices/invoices.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { pending_credits } from '@/domains/app/sub-domains/pending-credits/pending-credits.schema.js';
import type { PaymentsRepository } from './payments.repository.js';
import { serializePayment } from './payments.serializer.js';
import type { PaymentOutput } from './payments.types.js';
import {
  validateCreatePayment,
  validateListPaymentsQuery,
  validateUpdatePayment,
} from './payments.validator.js';

/**
 * Payments of the active organization (launch ROUTE #34): list, read, create, update,
 * soft-delete with a reason and restore, and the lifecycle actions `checked`.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Payment')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class PaymentsService extends BaseRecordService<PaymentOutput> {
  constructor(organizationService: OrganizationService, repository: PaymentsRepository) {
    super(organizationService, {
      label: 'Payment',
      repository,
      parseCreate: validateCreatePayment,
      parseUpdate: validateUpdatePayment,
      parseList: validateListPaymentsQuery,
      serialize: serializePayment,
      references: [
        { field: 'branch_id', table: branches, label: 'branch' },
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'invoice_id', table: invoices, label: 'invoice' },
        { field: 'credit_note_id', table: credit_notes, label: 'credit note' },
        { field: 'pending_credit_id', table: pending_credits, label: 'pending credit' },
        { field: 'day_close_id', table: day_closes, label: 'day close' },
      ],
      branchColumn: 'branch_id',
      checkValues: (values) => {
        if (
          values.direction === 'paid' &&
          (values.payee_name === undefined || values.payee_name === null)
        ) {
          throw new ValidationError(
            'errors:validation.recordFieldRule',
            { field: 'payee_name' },
            {
              payee_name: ['Add who was paid'],
            },
          );
        }
        if (
          values.kind === 'expense' &&
          (values.expense_category === undefined || values.expense_category === null)
        ) {
          throw new ValidationError(
            'errors:validation.recordFieldRule',
            { field: 'expense_category' },
            {
              expense_category: ['Pick an expense category'],
            },
          );
        }
      },
      transitions: {
        checked: { set: { is_checked_at_close: true } },
      },
    });
  }
}
