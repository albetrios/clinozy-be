import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { PatientNotesRepository } from './patient-notes.repository.js';
import { serializePatientNote } from './patient-notes.serializer.js';
import type { PatientNoteOutput } from './patient-notes.types.js';
import {
  validateCreatePatientNote,
  validateListPatientNotesQuery,
  validateUpdatePatientNote,
} from './patient-notes.validator.js';

/**
 * Patient notes of the active organization (launch ROUTE #29): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Patient note')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class PatientNotesService extends BaseRecordService<PatientNoteOutput> {
  constructor(organizationService: OrganizationService, repository: PatientNotesRepository) {
    super(organizationService, {
      label: 'Patient note',
      repository,
      parseCreate: validateCreatePatientNote,
      parseUpdate: validateUpdatePatientNote,
      parseList: validateListPatientNotesQuery,
      serialize: serializePatientNote,
      references: [{ field: 'patient_id', table: patients, label: 'patient' }],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
    });
  }
}
