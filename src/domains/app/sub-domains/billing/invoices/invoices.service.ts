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
import type { InvoiceOutput, InvoicePreviewOutput } from './invoices.types.js';
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
 *   and their amounts in the save's transaction (B5, B9–B13, B28) — a new line at its billed price,
 *   the best live offer (M26); the previews plan the same way and write nothing (D81, Q2). The
 *   list's `meta.due_total` and `meta.paid_total` sum every page the filters match (D81). Reading
 *   needs `payment:read`, billing (and its preview) `payment:create`, changing (and its preview)
 *   `payment:update`, deleting and restoring `payment:delete`, the export `payment:export` (the
 *   routes' gates, B2).
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
      listMeta: async ({ organizationId, query }) => ({
        due_total: await repository.sumOver({ organizationId, query, column: 'due_amount' }),
        paid_total: await repository.sumOver({ organizationId, query, column: 'paid_amount' }),
      }),
      ...createInvoicesRules(repository),
    });
  }

  /**
   * D81, Q2: what a bill would come to — its lines and totals as `POST /app/invoices` would write
   * them, nothing written (the rules' `preview` collection view).
   */
  async preview({
    scope,
    body,
    options,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    body: unknown;
    options: { actingUserPublicId?: string | undefined; visibility?: BaseRecordVisibility };
  }): Promise<InvoicePreviewOutput> {
    return (await this.collection({
      scope,
      kind: 'view',
      name: 'preview',
      input: body,
      options,
    })) as InvoicePreviewOutput;
  }

  /**
   * D81: what a change would come to — the lines and totals `PATCH /app/invoices/{invoice_id}`
   * would write, nothing written (the rules' `preview` view of the invoice).
   */
  async previewChange({
    scope,
    publicId,
    body,
    options,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    publicId: string;
    body: unknown;
    options: { actingUserPublicId?: string | undefined; visibility?: BaseRecordVisibility };
  }): Promise<InvoicePreviewOutput> {
    return (await this.view({
      scope,
      publicId,
      name: 'preview',
      query: body,
      options,
    })) as InvoicePreviewOutput;
  }

  /** Bills — and answers with the invoice as "Paid now" left it (its paid amount and status, B13). */
  override async create({
    scope,
    body,
    actingUserPublicId,
    parentPublicId,
    visibility,
    createName,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    body: unknown;
    actingUserPublicId: string | undefined;
    parentPublicId?: string | undefined;
    visibility?: BaseRecordVisibility | undefined;
    createName?: string | undefined;
  }): Promise<InvoiceOutput> {
    const created = await super.create({
      scope,
      body,
      actingUserPublicId,
      parentPublicId,
      visibility,
      createName,
    });
    return this.get({ scope, publicId: created.id, actingUserPublicId, visibility });
  }
}
