import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { invoices } from '@/domains/app/sub-domains/invoices/invoices.schema.js';
import type { CreditNotesRepository } from './credit-notes.repository.js';
import { serializeCreditNote } from './credit-notes.serializer.js';
import type { CreditNoteOutput } from './credit-notes.types.js';
import {
  validateCreateCreditNote,
  validateListCreditNotesQuery,
  validateUpdateCreditNote,
} from './credit-notes.validator.js';

/**
 * Credit notes of the active organization (launch ROUTE #36): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Credit note')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class CreditNotesService extends BaseRecordService<CreditNoteOutput> {
  constructor(organizationService: OrganizationService, repository: CreditNotesRepository) {
    super(organizationService, {
      label: 'Credit note',
      repository,
      parseCreate: validateCreateCreditNote,
      parseUpdate: validateUpdateCreditNote,
      parseList: validateListCreditNotesQuery,
      serialize: serializeCreditNote,
      references: [{ field: 'invoice_id', table: invoices, label: 'invoice' }],
    });
  }
}
