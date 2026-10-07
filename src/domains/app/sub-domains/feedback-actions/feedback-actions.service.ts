import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { ValidationError } from '@/shared/errors/index.js';
import { check_ins } from '@/domains/app/sub-domains/check-ins/check-ins.schema.js';
import { reviews } from '@/domains/app/sub-domains/reviews/reviews.schema.js';
import type { FeedbackActionsRepository } from './feedback-actions.repository.js';
import { serializeFeedbackAction } from './feedback-actions.serializer.js';
import type { FeedbackActionOutput } from './feedback-actions.types.js';
import {
  validateCreateFeedbackAction,
  validateListFeedbackActionsQuery,
  validateUpdateFeedbackAction,
} from './feedback-actions.validator.js';

/**
 * Feedback actions of the active organization (launch ROUTE #43): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Feedback action')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class FeedbackActionsService extends BaseRecordService<FeedbackActionOutput> {
  constructor(organizationService: OrganizationService, repository: FeedbackActionsRepository) {
    super(organizationService, {
      label: 'Feedback action',
      repository,
      parseCreate: validateCreateFeedbackAction,
      parseUpdate: validateUpdateFeedbackAction,
      parseList: validateListFeedbackActionsQuery,
      serialize: serializeFeedbackAction,
      references: [
        { field: 'check_in_id', table: check_ins, label: 'check-in' },
        { field: 'review_id', table: reviews, label: 'review' },
      ],
      checkValues: (values) => {
        if (
          (values.check_in_id === undefined || values.check_in_id === null) ===
          (values.review_id === undefined || values.review_id === null)
        ) {
          throw new ValidationError(
            'errors:validation.recordFieldRule',
            { field: 'check_in_id' },
            {
              check_in_id: ['Name exactly one of check_in_id or review_id'],
            },
          );
        }
        if (values.action === 'other' && (values.note === undefined || values.note === null)) {
          throw new ValidationError(
            'errors:validation.recordFieldRule',
            { field: 'note' },
            {
              note: ['Add a note for other'],
            },
          );
        }
      },
    });
  }
}
