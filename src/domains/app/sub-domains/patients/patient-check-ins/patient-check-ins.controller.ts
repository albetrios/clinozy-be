import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientCheckInsService } from './patient-check-ins.service.js';
import type { PatientCheckInOutput } from './patient-check-ins.types.js';

/** HTTP handlers for the `patient-check-ins` routes — {@link BaseRecordController} on {@link PatientCheckInsService}. */
export class PatientCheckInsController extends BaseRecordController<PatientCheckInOutput> {
  constructor(service: PatientCheckInsService) {
    super(service, {
      resource: 'patient_check_in',
      idParam: 'patient_check_in_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `patient-check-ins` controller the routes register. */
export function createPatientCheckInsController(
  service: PatientCheckInsService,
): PatientCheckInsController {
  return new PatientCheckInsController(service);
}
