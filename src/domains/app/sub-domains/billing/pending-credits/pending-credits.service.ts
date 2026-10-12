import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { payments } from '@/domains/app/sub-domains/billing/payments/payments.schema.js';
import type { PendingCreditsRepository } from './pending-credits.repository.js';
import { createPendingCreditsRules } from './pending-credits.rules.js';
import { serializePendingCredit } from './pending-credits.serializer.js';
import type { PendingCreditOutput } from './pending-credits.types.js';
import {
  validateCreatePendingCredit,
  validateListPendingCreditsQuery,
  validateUpdatePendingCredit,
} from './pending-credits.validator.js';

/**
 * Money owed to or by someone (launch ROUTE #136, routes-final 8.D): list, add (give or take),
 * read, change and delete while nothing is settled, restore, and settle in parts.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.pending_credits` — the
 *   organization's, not a branch's (B4); the contact, the invoice and the source payment are
 *   references. The rules hold who it is with and the settle action (B23, B24). Reading needs
 *   `payment:read`, adding and settling `payment:create`, changing `payment:update`, deleting and
 *   restoring `payment:delete` (the routes' gates, B2).
 * - **Failure modes:** `NotFoundError('Pending credit')`; `ValidationError` for a bad body or
 *   query, a reference that is no live record here, or a missing party; `ConflictError` per the
 *   rules, a stale save or a restore of a live credit.
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
        { field: 'contact_id', table: contacts, label: 'contact' },
        { field: 'invoice_id', table: invoices, label: 'invoice' },
        { field: 'source_payment_id', table: payments, label: 'payment' },
      ],
      ...createPendingCreditsRules(),
    });
  }
}
