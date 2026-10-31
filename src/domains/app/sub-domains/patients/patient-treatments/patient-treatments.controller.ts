import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import { PATIENT_MEDICAL_DETAIL_READERS } from '@/domains/app/sub-domains/patients/patients.constants.js';
import type { PatientTreatmentsService } from './patient-treatments.service.js';
import type { PatientTreatmentOutput } from './patient-treatments.types.js';

/**
 * HTTP handlers for the `patient-treatments` routes — {@link BaseRecordController} on
 * {@link PatientTreatmentsService}; a session's `remark` is `null` to a caller holding none of
 * {@link PATIENT_MEDICAL_DETAIL_READERS} (B1-1 — a role given `patient_treatment:read` alone sees
 * the sessions, not the clinician's remark).
 */
export class PatientTreatmentsController extends BaseRecordController<PatientTreatmentOutput> {
  constructor(service: PatientTreatmentsService) {
    super(service, {
      resource: 'patient_treatment',
      // G2-3: a clinical record's reads are audited
      auditReads: true,
      idParam: 'patient_treatment_id',
      parentParam: 'patient_id',
      hiddenFields: { remark: PATIENT_MEDICAL_DETAIL_READERS },
    });
  }
}

/** The `patient-treatments` controller the routes register. */
export function createPatientTreatmentsController(
  service: PatientTreatmentsService,
): PatientTreatmentsController {
  return new PatientTreatmentsController(service);
}
