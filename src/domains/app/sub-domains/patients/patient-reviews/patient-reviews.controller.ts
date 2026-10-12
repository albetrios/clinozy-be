import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientReviewsService } from './patient-reviews.service.js';
import type { PatientReviewOutput } from './patient-reviews.types.js';

/** HTTP handlers for the `patient-reviews` routes — {@link BaseRecordController} on {@link PatientReviewsService}. */
export class PatientReviewsController extends BaseRecordController<PatientReviewOutput> {
  constructor(service: PatientReviewsService) {
    super(service, {
      resource: 'patient_review',
      idParam: 'patient_review_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `patient-reviews` controller the routes register. */
export function createPatientReviewsController(
  service: PatientReviewsService,
): PatientReviewsController {
  return new PatientReviewsController(service);
}
