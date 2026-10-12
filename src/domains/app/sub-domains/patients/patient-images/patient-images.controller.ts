import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientImagesService } from './patient-images.service.js';
import type { PatientImageOutput } from './patient-images.types.js';

/** HTTP handlers for the `patient-images` routes — {@link BaseRecordController} on {@link PatientImagesService}. */
export class PatientImagesController extends BaseRecordController<PatientImageOutput> {
  constructor(service: PatientImagesService) {
    super(service, {
      resource: 'patient_image',
      idParam: 'patient_image_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `patient-images` controller the routes register. */
export function createPatientImagesController(
  service: PatientImagesService,
): PatientImagesController {
  return new PatientImagesController(service);
}
