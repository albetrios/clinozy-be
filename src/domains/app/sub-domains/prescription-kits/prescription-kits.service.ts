import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { PrescriptionKitsRepository } from './prescription-kits.repository.js';
import { serializePrescriptionKit } from './prescription-kits.serializer.js';
import type { PrescriptionKitOutput } from './prescription-kits.types.js';
import {
  validateCreatePrescriptionKit,
  validateListPrescriptionKitsQuery,
  validateUpdatePrescriptionKit,
} from './prescription-kits.validator.js';

/**
 * Prescription kits of the active organization (launch ROUTE #26): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Prescription kit')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class PrescriptionKitsService extends BaseRecordService<PrescriptionKitOutput> {
  constructor(organizationService: OrganizationService, repository: PrescriptionKitsRepository) {
    super(organizationService, {
      label: 'Prescription kit',
      repository,
      parseCreate: validateCreatePrescriptionKit,
      parseUpdate: validateUpdatePrescriptionKit,
      parseList: validateListPrescriptionKitsQuery,
      serialize: serializePrescriptionKit,
      ownedByActor: true,
    });
  }
}
