import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { PatientDiagnosesRepository } from './patient-diagnoses.repository.js';
import { serializePatientDiagnosis } from './patient-diagnoses.serializer.js';
import type { PatientDiagnosisOutput } from './patient-diagnoses.types.js';
import {
  validateCreatePatientDiagnosis,
  validateListPatientDiagnosesQuery,
  validateUpdatePatientDiagnosis,
} from './patient-diagnoses.validator.js';

/**
 * The organization's diagnosis catalogue (launch ROUTE #133, routes-final 7.E): list, read, add,
 * rename, soft-delete with a reason, restore — a clinical note of kind `diagnosis` picks from it
 * (P12, P18).
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} on its table; no patient (P28). Reading is
 *   every member's, writing the prescribers' (`patient_prescription:*` — the routes' gates).
 * - **Failure modes:** `NotFoundError('Diagnosis')`; `ValidationError` for a bad body;
 *   `ConflictError` for a name already in the catalogue (any case), a stale save, a restore of a
 *   live entry or of a name reused meanwhile.
 */
export class PatientDiagnosesService extends BaseRecordService<PatientDiagnosisOutput> {
  constructor(organizationService: OrganizationService, repository: PatientDiagnosesRepository) {
    super(organizationService, {
      label: 'Diagnosis',
      repository,
      parseCreate: validateCreatePatientDiagnosis,
      parseUpdate: validateUpdatePatientDiagnosis,
      parseList: validateListPatientDiagnosesQuery,
      serialize: serializePatientDiagnosis,
      conflicts: {
        idx_patient_diagnoses_organization_name_unique: 'errors:recordAlreadyExists',
      },
    });
  }
}
