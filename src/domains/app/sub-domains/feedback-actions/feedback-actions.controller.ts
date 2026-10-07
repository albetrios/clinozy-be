import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { FeedbackActionsService } from './feedback-actions.service.js';
import type { FeedbackActionOutput } from './feedback-actions.types.js';

/** HTTP handlers for the `feedback-actions` routes — {@link BaseRecordController} on {@link FeedbackActionsService}. */
export class FeedbackActionsController extends BaseRecordController<FeedbackActionOutput> {
  constructor(service: FeedbackActionsService) {
    super(service, { resource: 'feedback_action', idParam: 'feedback_action_id' });
  }
}

/** The `feedback-actions` controller the routes register. */
export function createFeedbackActionsController(
  service: FeedbackActionsService,
): FeedbackActionsController {
  return new FeedbackActionsController(service);
}
