import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { OfferingSuggestionsService } from './offering-suggestions.service.js';
import type { OfferingSuggestionOutput } from './offering-suggestions.types.js';

/** HTTP handlers for the `offering-suggestions` routes — {@link BaseRecordController} on {@link OfferingSuggestionsService}. */
export class OfferingSuggestionsController extends BaseRecordController<OfferingSuggestionOutput> {
  constructor(service: OfferingSuggestionsService) {
    super(service, {
      resource: 'offering_suggestion',
      idParam: 'offering_suggestion_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `offering-suggestions` controller the routes register. */
export function createOfferingSuggestionsController(
  service: OfferingSuggestionsService,
): OfferingSuggestionsController {
  return new OfferingSuggestionsController(service);
}
