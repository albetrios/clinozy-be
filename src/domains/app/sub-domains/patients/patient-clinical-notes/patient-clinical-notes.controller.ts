import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientClinicalNotesService } from './patient-clinical-notes.service.js';
import type { PatientClinicalNoteOutput } from './patient-clinical-notes.types.js';

/** HTTP handlers for the `patient-clinical-notes` routes — {@link BaseRecordController} on {@link PatientClinicalNotesService}. */
export class PatientClinicalNotesController extends BaseRecordController<PatientClinicalNoteOutput> {
  constructor(service: PatientClinicalNotesService) {
    super(service, {
      resource: 'patient_clinical_note',
      idParam: 'patient_clinical_note_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `patient-clinical-notes` controller the routes register. */
export function createPatientClinicalNotesController(
  service: PatientClinicalNotesService,
): PatientClinicalNotesController {
  return new PatientClinicalNotesController(service);
}
