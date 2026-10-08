import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { patient_diagnoses } from '@/domains/app/sub-domains/patients/patient-diagnoses/patient-diagnoses.schema.js';
import type { PatientClinicalNotesRepository } from './patient-clinical-notes.repository.js';
import { patientClinicalNotesRules } from './patient-clinical-notes.rules.js';
import { serializePatientClinicalNote } from './patient-clinical-notes.serializer.js';
import type { PatientClinicalNoteOutput } from './patient-clinical-notes.types.js';
import {
  refusePatientClinicalNoteUpdate,
  validateCreatePatientClinicalNote,
  validateListPatientClinicalNotesQuery,
} from './patient-clinical-notes.validator.js';

/**
 * A patient's clinical notes (launch ROUTE #133, routes-final 7.B): list, read, add, delete a wrong
 * one with a reason, restore — never edited (P12).
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} nested under the patient (`patient_id` — a
 *   removed or unknown patient is a 404); the visit and the diagnosis catalogue entry are
 *   references. Reading needs `patient:clinical_record:read`, writing `patient:update` with it
 *   (P14 — the routes' gates).
 * - **Failure modes:** `NotFoundError('Clinical note')` / `('Patient')`; `ValidationError` for a bad
 *   body, a reference that is no live record here, another patient's visit or a catalogue entry on
 *   a note that is no diagnosis; `ConflictError` for a restore of a live note.
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
      parseUpdate: refusePatientClinicalNoteUpdate,
      parseList: validateListPatientClinicalNotesQuery,
      serialize: serializePatientClinicalNote,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
        { field: 'patient_diagnosis_id', table: patient_diagnoses, label: 'diagnosis' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
      ...patientClinicalNotesRules,
    });
  }
}
