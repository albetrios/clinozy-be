import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { medical_contacts } from '@/domains/app/sub-domains/medical-contacts/medical-contacts.schema.js';
import { medical_sales } from '@/domains/app/sub-domains/medical-sales/medical-sales.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { prescriptions } from '@/domains/app/sub-domains/prescriptions/prescriptions.schema.js';
import { INVOICE_TEAM_MEMBERSHIPS_LINK, type InvoicesRepository } from './invoices.repository.js';
import { serializeInvoice } from './invoices.serializer.js';
import type { InvoiceOutput } from './invoices.types.js';
import {
  validateCreateInvoice,
  validateListInvoicesQuery,
  validateUpdateInvoice,
} from './invoices.validator.js';

/**
 * Invoices of the active organization (launch ROUTE #30): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Invoice')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
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
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'prescription_id', table: prescriptions, label: 'prescription' },
        { field: 'medical_contact_id', table: medical_contacts, label: 'medical contact' },
        { field: 'medical_sale_id', table: medical_sales, label: 'medical sale' },
      ],
      referenceLists: [
        { field: 'team_membership_ids', link: INVOICE_TEAM_MEMBERSHIPS_LINK, label: 'team member' },
      ],
      branchColumn: 'branch_id',
    });
  }
}
