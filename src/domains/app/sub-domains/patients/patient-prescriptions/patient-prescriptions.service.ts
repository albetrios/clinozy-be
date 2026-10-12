import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { memberReference } from '@/domains/app/app-member-reference.js';
import { PATIENT_PRESCRIPTION_STATUS } from './patient-prescriptions.constants.js';
import type { PatientPrescriptionsRepository } from './patient-prescriptions.repository.js';
import { patientPrescriptionsRules } from './patient-prescriptions.rules.js';
import { serializePatientPrescription } from './patient-prescriptions.serializer.js';
import type { PatientPrescriptionOutput } from './patient-prescriptions.types.js';
import {
  validateCreatePatientPrescription,
  validateListPatientPrescriptionsQuery,
  validateUpdatePatientPrescription,
} from './patient-prescriptions.validator.js';

/**
 * Patient prescriptions (launch ROUTE #133, routes-final 7.C): the pharmacy queue across patients,
 * a patient's list, write, read, change a draft, approve (final), delete and restore a draft.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} nested under the patient (`patient_id` — a
 *   removed or unknown patient is a 404; the nested list's path wins over `?patient_id=`, TR3), and
 *   top-level for the queue. `approve` moves a `draft` to `approved`, stamping `approved_at` and the
 *   approver (P15). Not branch-scoped (P6).
 * - **Failure modes:** `NotFoundError('Prescription')` / `('Patient')`; `ValidationError` for a bad
 *   body or query, a reference that is no live record here, a line's medicine that is none, another
 *   patient's visit, or approving with no line; `ConflictError` `prescription_approved`,
 *   `transition_not_allowed`, a stale save or a restore of a live draft.
 */
export class PatientPrescriptionsService extends BaseRecordService<PatientPrescriptionOutput> {
  constructor(
    organizationService: OrganizationService,
    repository: PatientPrescriptionsRepository,
  ) {
    super(organizationService, {
      label: 'Prescription',
      repository,
      parseCreate: validateCreatePatientPrescription,
      parseUpdate: validateUpdatePatientPrescription,
      parseList: validateListPatientPrescriptionsQuery,
      serialize: serializePatientPrescription,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
        memberReference('doctor_membership_id'),
        memberReference('approved_by_membership_id'),
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
      transitions: {
        approve: {
          from: [PATIENT_PRESCRIPTION_STATUS.DRAFT],
          set: { status: PATIENT_PRESCRIPTION_STATUS.APPROVED },
          stamp: ['approved_at'],
        },
      },
      ...patientPrescriptionsRules,
    });
  }
}
