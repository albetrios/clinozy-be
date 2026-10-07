import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import {
  MEDICAL_REP_MANUFACTURERS_LINK,
  type MedicalRepsRepository,
} from './medical-reps.repository.js';
import { serializeMedicalRep } from './medical-reps.serializer.js';
import type { MedicalRepOutput } from './medical-reps.types.js';
import {
  validateCreateMedicalRep,
  validateListMedicalRepsQuery,
  validateUpdateMedicalRep,
} from './medical-reps.validator.js';

/**
 * Medical reps of the active organization (launch ROUTE #46): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Medical rep')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class MedicalRepsService extends BaseRecordService<MedicalRepOutput> {
  constructor(organizationService: OrganizationService, repository: MedicalRepsRepository) {
    super(organizationService, {
      label: 'Medical rep',
      repository,
      parseCreate: validateCreateMedicalRep,
      parseUpdate: validateUpdateMedicalRep,
      parseList: validateListMedicalRepsQuery,
      serialize: serializeMedicalRep,
      referenceLists: [
        { field: 'manufacturer_ids', link: MEDICAL_REP_MANUFACTURERS_LINK, label: 'manufacturer' },
      ],
    });
  }
}
