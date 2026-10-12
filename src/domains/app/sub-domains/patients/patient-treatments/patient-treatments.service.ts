import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { memberReference } from '@/domains/app/app-member-reference.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patient_offerings } from '@/domains/app/sub-domains/patients/patient-offerings/patient-offerings.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { PATIENT_TREATMENT_STATUS } from './patient-treatments.constants.js';
import type { PatientTreatmentsRepository } from './patient-treatments.repository.js';
import { createPatientTreatmentsRules } from './patient-treatments.rules.js';
import { serializePatientTreatment } from './patient-treatments.serializer.js';
import type { PatientTreatmentOutput } from './patient-treatments.types.js';
import {
  validateCreatePatientTreatment,
  validateListPatientTreatmentsQuery,
  validateReversePatientTreatment,
  validateUpdatePatientTreatment,
} from './patient-treatments.validator.js';

/**
 * Patients' treatment sessions (launch ROUTE #134, routes-final 7.H): every patient's list (a
 * doctor's or therapist's sessions), a patient's list, read, record (spending a bought session),
 * change, and reverse with a reason — never deleted (TR6).
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} nested under the patient (`patient_id` — a
 *   removed or unknown patient is a 404; the organization list has no parent and filters by
 *   `patient_id`); the visit, offering, team members and the bought offering are references. The
 *   `reverse` transition (`done` only) sets the reason and `reversed_at`; the rules give the session
 *   back. Reading needs `patient_treatment:read`, recording `:create`, changing and reversing
 *   `:update` (the routes' gates).
 * - **Failure modes:** `NotFoundError('Patient treatment')` / `('Patient')`; `ValidationError` for
 *   a bad body or query, a reference that is no live record here, or a rule (the rules' list);
 *   `ConflictError` `offering_expired`, `offering_used_up`, `treatment_reversed`,
 *   `transition_not_allowed` (already reversed), `record_changed`.
 */
export class PatientTreatmentsService extends BaseRecordService<PatientTreatmentOutput> {
  constructor(organizationService: OrganizationService, repository: PatientTreatmentsRepository) {
    super(organizationService, {
      label: 'Patient treatment',
      repository,
      parseCreate: validateCreatePatientTreatment,
      parseUpdate: validateUpdatePatientTreatment,
      parseList: validateListPatientTreatmentsQuery,
      serialize: serializePatientTreatment,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
        { field: 'offering_id', table: offerings, label: 'offering' },
        memberReference('doctor_membership_id'),
        memberReference('therapist_membership_id'),
        { field: 'patient_offering_id', table: patient_offerings, label: 'bought offering' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
      transitions: {
        reverse: {
          from: [PATIENT_TREATMENT_STATUS.DONE],
          set: { status: PATIENT_TREATMENT_STATUS.REVERSED },
          stamp: ['reversed_at'],
          parse: validateReversePatientTreatment,
        },
      },
      ...createPatientTreatmentsRules(repository),
    });
  }
}
