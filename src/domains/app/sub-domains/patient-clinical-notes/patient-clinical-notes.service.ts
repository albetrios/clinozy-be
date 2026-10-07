import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { PatientClinicalNotesRepository } from './patient-clinical-notes.repository.js';
import { serializePatientClinicalNote } from './patient-clinical-notes.serializer.js';
import type { PatientClinicalNoteOutput } from './patient-clinical-notes.types.js';
import {
  validateCreatePatientClinicalNote,
  validateListPatientClinicalNotesQuery,
  validateUpdatePatientClinicalNote,
} from './patient-clinical-notes.validator.js';

/**
 * Clinical notes of the active organization (launch ROUTE #24): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Clinical note')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class PatientClinicalNotesService extends BaseRecordService<PatientClinicalNoteOutput> {
  constructor(
    organizationService: OrganizationService,
    repository: PatientClinicalNotesRepository,
  ) {
    super(organizationService, {
      label: 'Clinical note',
      repository,
      parseCreate: validateCreatePatientClinicalNote,
      parseUpdate: validateUpdatePatientClinicalNote,
      parseList: validateListPatientClinicalNotesQuery,
      serialize: serializePatientClinicalNote,
      references: [{ field: 'patient_id', table: patients, label: 'patient' }],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
    });
  }
}
