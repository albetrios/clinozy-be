import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import { PATIENT_MEDICAL_DETAIL_READERS } from '@/domains/app/sub-domains/patients/patients.constants.js';
import type { PatientCheckInsService } from './patient-check-ins.service.js';
import type { PatientCheckInOutput } from './patient-check-ins.types.js';

/**
 * HTTP handlers for the `patient-check-ins` routes — {@link BaseRecordController} on
 * {@link PatientCheckInsService}; a check-in's clinical text (`context`, `followed_note`,
 * `current_state`, `next_plan`) is `null` to a caller holding none of
 * {@link PATIENT_MEDICAL_DETAIL_READERS} — the Accountant and Marketing read `feel`, `score` and the
 * dates only (B1-1).
 */
export class PatientCheckInsController extends BaseRecordController<PatientCheckInOutput> {
  constructor(service: PatientCheckInsService) {
    super(service, {
      resource: 'patient_check_in',
      idParam: 'patient_check_in_id',
      parentParam: 'patient_id',
      hiddenFields: {
        context: PATIENT_MEDICAL_DETAIL_READERS,
        followed_note: PATIENT_MEDICAL_DETAIL_READERS,
        current_state: PATIENT_MEDICAL_DETAIL_READERS,
        next_plan: PATIENT_MEDICAL_DETAIL_READERS,
      },
    });
  }
}

/** The `patient-check-ins` controller the routes register. */
export function createPatientCheckInsController(
  service: PatientCheckInsService,
): PatientCheckInsController {
  return new PatientCheckInsController(service);
}
