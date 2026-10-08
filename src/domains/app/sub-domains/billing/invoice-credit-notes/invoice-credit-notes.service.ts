import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { listVisibleBranchIds } from '@/domains/app/base-record.repository.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type {
  BaseRecordListResult,
  BaseRecordVisibility,
} from '@/domains/app/base-record.types.js';
import type { InvoicesService } from '@/domains/app/sub-domains/billing/invoices/invoices.service.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import type { InvoiceCreditNotesRepository } from './invoice-credit-notes.repository.js';
import { createInvoiceCreditNotesRules } from './invoice-credit-notes.rules.js';
import { serializeInvoiceCreditNote } from './invoice-credit-notes.serializer.js';
import type { InvoiceCreditNoteOutput } from './invoice-credit-notes.types.js';
import {
  refuseInvoiceCreditNoteUpdate,
  validateCreateInvoiceCreditNote,
  validateListInvoiceCreditNotesQuery,
} from './invoice-credit-notes.validator.js';

/** The list options the base service takes. */
type ListOptions = Parameters<BaseRecordService<InvoiceCreditNoteOutput>['list']>[2];

/**
 * The organization's credit notes (launch ROUTE #136, routes-final 8.B): every credit note, an
 * invoice's, one — and the refund that writes one with its refund payment (B16).
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} nested under the invoice (`invoice_id`).
 *   The branch is the invoice's (B4): a nested route first reads its invoice through
 *   {@link InvoicesService} — another branch's is a 404 without `branch:read` — and the
 *   organization-wide list is narrowed to the caller's branches. The rules write the refund
 *   payment in the credit note's transaction. Reading needs `payment:read`, refunding
 *   `payment:create` (the routes' gates).
 * - **Failure modes:** `NotFoundError('Invoice credit note')` / `('Invoice')`; `ValidationError`
 *   for a bad body or query; `ConflictError` `more_than_paid`, `day_closed`.
 */
export class InvoiceCreditNotesService extends BaseRecordService<InvoiceCreditNoteOutput> {
  constructor(
    organizationService: OrganizationService,
    repository: InvoiceCreditNotesRepository,
    private readonly invoicesService: InvoicesService,
  ) {
    super(organizationService, {
      label: 'Invoice credit note',
      repository,
      parseCreate: validateCreateInvoiceCreditNote,
      parseUpdate: refuseInvoiceCreditNoteUpdate,
      parseList: validateListInvoiceCreditNotesQuery,
      serialize: serializeInvoiceCreditNote,
      references: [{ field: 'invoice_id', table: invoices, label: 'invoice' }],
      parent: { field: 'invoice_id', table: invoices, label: 'Invoice' },
      ...createInvoiceCreditNotesRules(),
    });
  }

  /** B4: the invoice must be one the caller sees — a 404 `Invoice` otherwise. */
  private async assertInvoiceVisible(options: {
    scope: OrganizationPrincipalDatabaseScope;
    invoicePublicId: string | undefined;
    actingUserPublicId: string | undefined;
    visibility: BaseRecordVisibility | undefined;
  }): Promise<void> {
    if (options.invoicePublicId === undefined) return;
    await this.invoicesService.get(
      options.scope,
      options.invoicePublicId,
      options.actingUserPublicId,
      options.visibility,
    );
  }

  /** B4: the caller's branches — undefined when every branch is theirs (`branch:read`). */
  private async visibleBranches(options: {
    scope: OrganizationPrincipalDatabaseScope;
    actingUserPublicId: string | undefined;
    visibility: BaseRecordVisibility | undefined;
  }): Promise<number[] | undefined> {
    if (!options.visibility || options.visibility.allBranches) return undefined;
    return withAppDatabaseContext(options.scope, async () => {
      const userId = await this.userId(options.actingUserPublicId);
      if (userId === null) return [];
      return listVisibleBranchIds({
        organizationId: await this.organizationId(options.scope),
        userId,
      });
    });
  }

  /** Every credit note, or an invoice's — within the caller's branches (B4). */
  override async list(
    scope: OrganizationPrincipalDatabaseScope,
    query: unknown,
    options: ListOptions = {},
  ): Promise<BaseRecordListResult<InvoiceCreditNoteOutput>> {
    await this.assertInvoiceVisible({
      scope,
      invoicePublicId: options.parentPublicId,
      actingUserPublicId: options.actingUserPublicId,
      visibility: options.visibility,
    });
    const visibleBranchIds = await this.visibleBranches({
      scope,
      actingUserPublicId: options.actingUserPublicId,
      visibility: options.visibility,
    });
    return super.list(
      scope,
      visibleBranchIds === undefined
        ? query
        : { ...(query as Record<string, unknown>), visible_branch_ids: visibleBranchIds },
      options,
    );
  }

  /** One credit note of an invoice the caller sees (B4). */
  override async get(
    scope: OrganizationPrincipalDatabaseScope,
    publicId: string,
    actingUserPublicId?: string,
    visibility?: BaseRecordVisibility,
    parentPublicId?: string,
  ): Promise<InvoiceCreditNoteOutput> {
    await this.assertInvoiceVisible({
      scope,
      invoicePublicId: parentPublicId,
      actingUserPublicId,
      visibility,
    });
    return super.get(scope, publicId, actingUserPublicId, visibility, parentPublicId);
  }

  /** B16: a refund on an invoice the caller sees — the credit note and its refund payment. */
  override async create(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    actingUserPublicId: string | undefined,
    parentPublicId?: string,
    visibility?: BaseRecordVisibility,
    createName?: string,
  ): Promise<InvoiceCreditNoteOutput> {
    await this.assertInvoiceVisible({
      scope,
      invoicePublicId: parentPublicId,
      actingUserPublicId,
      visibility,
    });
    return super.create(scope, body, actingUserPublicId, parentPublicId, visibility, createName);
  }
}
