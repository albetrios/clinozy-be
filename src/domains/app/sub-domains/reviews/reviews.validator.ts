import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateReviewDto,
  type CreateReviewInput,
  listReviewsQueryDto,
  UpdateReviewDto,
  type UpdateReviewInput,
} from './reviews.dto.js';

/** Parses a review create body; throws `ValidationError` naming each bad field. */
export function validateCreateReview(data: unknown): CreateReviewInput {
  return parseWithSchema(CreateReviewDto, data);
}

/** Parses a review update body; throws `ValidationError` naming each bad field. */
export function validateUpdateReview(data: unknown): UpdateReviewInput {
  return parseWithSchema(UpdateReviewDto, data);
}

/** Parses the `GET /app/reviews` query into a list input (filters by column). */
export function validateListReviewsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listReviewsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      source: query.source,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
