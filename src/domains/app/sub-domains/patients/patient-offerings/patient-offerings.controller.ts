import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientOfferingsService } from './patient-offerings.service.js';
import type { PatientOfferingOutput } from './patient-offerings.types.js';

/** HTTP handlers for the `patient-offerings` routes — {@link BaseRecordController} on {@link PatientOfferingsService}. */
export class PatientOfferingsController extends BaseRecordController<PatientOfferingOutput> {
  constructor(service: PatientOfferingsService) {
    super(service, {
      resource: 'patient_offering',
      idParam: 'patient_offering_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `patient-offerings` controller the routes register. */
export function createPatientOfferingsController(
  service: PatientOfferingsService,
): PatientOfferingsController {
  return new PatientOfferingsController(service);
}
