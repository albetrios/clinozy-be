import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { ReviewsService } from './reviews.service.js';
import type { ReviewOutput } from './reviews.types.js';

/** HTTP handlers for the `reviews` routes — {@link BaseRecordController} on {@link ReviewsService}. */
export class ReviewsController extends BaseRecordController<ReviewOutput> {
  constructor(service: ReviewsService) {
    super(service, { resource: 'review', idParam: 'review_id', parentParam: 'patient_id' });
  }
}

/** The `reviews` controller the routes register. */
export function createReviewsController(service: ReviewsService): ReviewsController {
  return new ReviewsController(service);
}
