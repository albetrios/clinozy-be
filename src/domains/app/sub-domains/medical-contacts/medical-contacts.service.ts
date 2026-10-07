import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { MedicalContactsRepository } from './medical-contacts.repository.js';
import { serializeMedicalContact } from './medical-contacts.serializer.js';
import type { MedicalContactOutput } from './medical-contacts.types.js';
import {
  validateCreateMedicalContact,
  validateListMedicalContactsQuery,
  validateUpdateMedicalContact,
} from './medical-contacts.validator.js';

/**
 * Medical contacts of the active organization (launch ROUTE #50): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Medical contact')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class MedicalContactsService extends BaseRecordService<MedicalContactOutput> {
  constructor(organizationService: OrganizationService, repository: MedicalContactsRepository) {
    super(organizationService, {
      label: 'Medical contact',
      repository,
      parseCreate: validateCreateMedicalContact,
      parseUpdate: validateUpdateMedicalContact,
      parseList: validateListMedicalContactsQuery,
      serialize: serializeMedicalContact,
    });
  }
}
