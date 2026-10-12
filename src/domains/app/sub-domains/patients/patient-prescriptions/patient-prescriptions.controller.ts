import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientPrescriptionsService } from './patient-prescriptions.service.js';
import type { PatientPrescriptionOutput } from './patient-prescriptions.types.js';

/** HTTP handlers for the `patient-prescriptions` routes — {@link BaseRecordController} on {@link PatientPrescriptionsService}. */
export class PatientPrescriptionsController extends BaseRecordController<PatientPrescriptionOutput> {
  constructor(service: PatientPrescriptionsService) {
    super(service, {
      resource: 'patient_prescription',
      idParam: 'patient_prescription_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `patient-prescriptions` controller the routes register. */
export function createPatientPrescriptionsController(
  service: PatientPrescriptionsService,
): PatientPrescriptionsController {
  return new PatientPrescriptionsController(service);
}
