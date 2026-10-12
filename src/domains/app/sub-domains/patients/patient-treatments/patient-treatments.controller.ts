import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientTreatmentsService } from './patient-treatments.service.js';
import type { PatientTreatmentOutput } from './patient-treatments.types.js';

/** HTTP handlers for the `patient-treatments` routes — {@link BaseRecordController} on {@link PatientTreatmentsService}. */
export class PatientTreatmentsController extends BaseRecordController<PatientTreatmentOutput> {
  constructor(service: PatientTreatmentsService) {
    super(service, {
      resource: 'patient_treatment',
      idParam: 'patient_treatment_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `patient-treatments` controller the routes register. */
export function createPatientTreatmentsController(
  service: PatientTreatmentsService,
): PatientTreatmentsController {
  return new PatientTreatmentsController(service);
}
