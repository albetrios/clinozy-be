import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { medical_reps } from '@/domains/app/sub-domains/medical-reps/medical-reps.schema.js';
import type { MedicalRepVisitsRepository } from './medical-rep-visits.repository.js';
import { serializeMedicalRepVisit } from './medical-rep-visits.serializer.js';
import type { MedicalRepVisitOutput } from './medical-rep-visits.types.js';
import {
  validateCreateMedicalRepVisit,
  validateListMedicalRepVisitsQuery,
  validateUpdateMedicalRepVisit,
} from './medical-rep-visits.validator.js';

/**
 * Medical rep visits of the active organization (launch ROUTE #47): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Medical rep visit')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class MedicalRepVisitsService extends BaseRecordService<MedicalRepVisitOutput> {
  constructor(organizationService: OrganizationService, repository: MedicalRepVisitsRepository) {
    super(organizationService, {
      label: 'Medical rep visit',
      repository,
      parseCreate: validateCreateMedicalRepVisit,
      parseUpdate: validateUpdateMedicalRepVisit,
      parseList: validateListMedicalRepVisitsQuery,
      serialize: serializeMedicalRepVisit,
      references: [{ field: 'medical_rep_id', table: medical_reps, label: 'medical rep' }],
      parent: { field: 'medical_rep_id', table: medical_reps, label: 'Medical rep' },
    });
  }
}
