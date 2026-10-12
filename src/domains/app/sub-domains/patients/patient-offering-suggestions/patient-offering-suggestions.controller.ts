import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientOfferingSuggestionsService } from './patient-offering-suggestions.service.js';
import type { PatientOfferingSuggestionOutput } from './patient-offering-suggestions.types.js';

/** HTTP handlers for the `patient-offering-suggestions` routes — {@link BaseRecordController} on {@link PatientOfferingSuggestionsService}. */
export class PatientOfferingSuggestionsController extends BaseRecordController<PatientOfferingSuggestionOutput> {
  constructor(service: PatientOfferingSuggestionsService) {
    super(service, {
      resource: 'patient_offering_suggestion',
      idParam: 'patient_offering_suggestion_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `patient-offering-suggestions` controller the routes register. */
export function createPatientOfferingSuggestionsController(
  service: PatientOfferingSuggestionsService,
): PatientOfferingSuggestionsController {
  return new PatientOfferingSuggestionsController(service);
}
