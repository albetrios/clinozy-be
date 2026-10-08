import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { patient_prescriptions } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.schema.js';
import { INVOICE_MEMBERS_LINK, type InvoicesRepository } from './invoices.repository.js';
import { createInvoicesRules } from './invoices.rules.js';
import { serializeInvoice } from './invoices.serializer.js';
import type { InvoiceOutput } from './invoices.types.js';
import {
  validateCreateInvoice,
  validateListInvoicesQuery,
  validateUpdateInvoice,
} from './invoices.validator.js';

/**
 * The organization's bills (launch ROUTE #136, routes-final 8.A): list and export, bill —
 * optionally with "Paid now" — read (the print preview), change until settled, delete while unpaid,
 * restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on `app.invoices`, branch-scoped (B4 —
 *   `branch:read` sees every branch); the branch, the billed contact and the prescription are
 *   references, the credited team the `member_ids` link (B15). The rules plan and write the lines
 *   and their amounts in the save's transaction (B5, B9–B13, B28). Reading needs `payment:read`,
 *   billing `payment:create`, changing `payment:update`, deleting and restoring `payment:delete`,
 *   the export `payment:export` (the routes' gates, B2).
 * - **Failure modes:** `NotFoundError('Invoice')`; `ValidationError` for a bad body or query, a
 *   reference that is no live record here, or a line rule; `ConflictError` per the rules, a stale
 *   save or a restore of a live invoice.
 */
export class InvoicesService extends BaseRecordService<InvoiceOutput> {
  constructor(organizationService: OrganizationService, repository: InvoicesRepository) {
    super(organizationService, {
      label: 'Invoice',
      repository,
      parseCreate: validateCreateInvoice,
      parseUpdate: validateUpdateInvoice,
      parseList: validateListInvoicesQuery,
      serialize: serializeInvoice,
      references: [
        { field: 'branch_id', table: branches, label: 'branch' },
        { field: 'contact_id', table: contacts, label: 'contact' },
        {
          field: 'patient_prescription_id',
          table: patient_prescriptions,
          label: 'prescription',
        },
      ],
      referenceLists: [{ field: 'member_ids', link: INVOICE_MEMBERS_LINK, label: 'team member' }],
      branchColumn: 'branch_id',
      ...createInvoicesRules(repository),
    });
  }

  /** Bills — and answers with the invoice as "Paid now" left it (its paid amount and status, B13). */
  override async create(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    actingUserPublicId: string | undefined,
    parentPublicId?: string,
    visibility?: BaseRecordVisibility,
    createName?: string,
  ): Promise<InvoiceOutput> {
    const created = await super.create(
      scope,
      body,
      actingUserPublicId,
      parentPublicId,
      visibility,
      createName,
    );
    return this.get(scope, created.id, actingUserPublicId, visibility);
  }
}
