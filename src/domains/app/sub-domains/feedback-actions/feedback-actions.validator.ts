import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateFeedbackActionDto,
  type CreateFeedbackActionInput,
  listFeedbackActionsQueryDto,
  UpdateFeedbackActionDto,
  type UpdateFeedbackActionInput,
} from './feedback-actions.dto.js';

/** Parses a feedback action create body; throws `ValidationError` naming each bad field. */
export function validateCreateFeedbackAction(data: unknown): CreateFeedbackActionInput {
  return parseWithSchema(CreateFeedbackActionDto, data);
}

/** Parses a feedback action update body; throws `ValidationError` naming each bad field. */
export function validateUpdateFeedbackAction(data: unknown): UpdateFeedbackActionInput {
  return parseWithSchema(UpdateFeedbackActionDto, data);
}

/** Parses the `GET /app/feedback-actions` query into a list input (filters by column). */
export function validateListFeedbackActionsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listFeedbackActionsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      action: query.action,
    },
    referenceEquals: {
      check_in_id: query.check_in_id,
      review_id: query.review_id,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
