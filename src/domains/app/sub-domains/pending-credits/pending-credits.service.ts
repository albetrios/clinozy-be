import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { invoices } from '@/domains/app/sub-domains/invoices/invoices.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { payments } from '@/domains/app/sub-domains/payments/payments.schema.js';
import type { PendingCreditsRepository } from './pending-credits.repository.js';
import { serializePendingCredit } from './pending-credits.serializer.js';
import type { PendingCreditOutput } from './pending-credits.types.js';
import {
  validateCreatePendingCredit,
  validateListPendingCreditsQuery,
  validateUpdatePendingCredit,
} from './pending-credits.validator.js';

/**
 * Pending credits of the active organization (launch ROUTE #37): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Pending credit')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class PendingCreditsService extends BaseRecordService<PendingCreditOutput> {
  constructor(organizationService: OrganizationService, repository: PendingCreditsRepository) {
    super(organizationService, {
      label: 'Pending credit',
      repository,
      parseCreate: validateCreatePendingCredit,
      parseUpdate: validateUpdatePendingCredit,
      parseList: validateListPendingCreditsQuery,
      serialize: serializePendingCredit,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'source_payment_id', table: payments, label: 'payment' },
        { field: 'settled_payment_id', table: payments, label: 'payment' },
        { field: 'invoice_id', table: invoices, label: 'invoice' },
      ],
    });
  }
}
