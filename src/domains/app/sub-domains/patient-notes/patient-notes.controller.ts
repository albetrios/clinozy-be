import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientNotesService } from './patient-notes.service.js';
import type { PatientNoteOutput } from './patient-notes.types.js';

/** HTTP handlers for the `patient-notes` routes — {@link BaseRecordController} on {@link PatientNotesService}. */
export class PatientNotesController extends BaseRecordController<PatientNoteOutput> {
  constructor(service: PatientNotesService) {
    super(service, {
      resource: 'patient_note',
      idParam: 'patient_note_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `patient-notes` controller the routes register. */
export function createPatientNotesController(service: PatientNotesService): PatientNotesController {
  return new PatientNotesController(service);
}
