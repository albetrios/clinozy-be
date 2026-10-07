import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { DiagnosesRepository } from './diagnoses.repository.js';
import { serializeDiagnosis } from './diagnoses.serializer.js';
import type { DiagnosisOutput } from './diagnoses.types.js';
import {
  validateCreateDiagnosis,
  validateListDiagnosesQuery,
  validateUpdateDiagnosis,
} from './diagnoses.validator.js';

/**
 * Diagnosiss of the active organization (launch ROUTE #23): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Diagnosis')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class DiagnosesService extends BaseRecordService<DiagnosisOutput> {
  constructor(organizationService: OrganizationService, repository: DiagnosesRepository) {
    super(organizationService, {
      label: 'Diagnosis',
      repository,
      parseCreate: validateCreateDiagnosis,
      parseUpdate: validateUpdateDiagnosis,
      parseList: validateListDiagnosesQuery,
      serialize: serializeDiagnosis,
      conflicts: {
        idx_diagnoses_organization_name_unique: 'errors:recordAlreadyExists',
      },
    });
  }
}
