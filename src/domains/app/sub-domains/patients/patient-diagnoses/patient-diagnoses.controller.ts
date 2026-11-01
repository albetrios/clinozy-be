import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientDiagnosesService } from './patient-diagnoses.service.js';
import type { PatientDiagnosisOutput } from './patient-diagnoses.types.js';

/** HTTP handlers for the `patient-diagnoses` routes — {@link BaseRecordController} on {@link PatientDiagnosesService}. */
export class PatientDiagnosesController extends BaseRecordController<PatientDiagnosisOutput> {
  constructor(service: PatientDiagnosesService) {
    // G2-3: a clinical record's reads are audited
    super(service, {
      resource: 'patient_diagnosis',
      idParam: 'patient_diagnosis_id',
      auditReads: true,
    });
  }
}

/** The `patient-diagnoses` controller the routes register. */
export function createPatientDiagnosesController(
  service: PatientDiagnosesService,
): PatientDiagnosesController {
  return new PatientDiagnosesController(service);
}
