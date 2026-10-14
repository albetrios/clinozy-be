import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  addDaysToCalendarDate,
  queryInstantRange,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePatientReviewDto,
  type CreatePatientReviewInput,
  listPatientReviewsQueryDto,
  UpdatePatientReviewDto,
  type UpdatePatientReviewInput,
} from './patient-reviews.dto.js';

/** Parses a review create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientReview(data: unknown): CreatePatientReviewInput {
  return parseWithSchema({ schema: CreatePatientReviewDto, data });
}

/** Parses a review update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientReview(data: unknown): UpdatePatientReviewInput {
  return parseWithSchema({ schema: UpdatePatientReviewDto, data });
}

/** Parses a patient's reviews query into a list input (routes-final 7.J.8 #57). */
export function validateListPatientReviewsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listPatientReviewsQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    equals: {
      source: query.source?.split(','),
    },
    derived: {
      needs_action: query.needs_action === undefined ? undefined : query.needs_action === 'true',
    },
    ranges: {
      review_date: {
        from: query.review_date_from,
        to:
          query.review_date_to === undefined
            ? undefined
            : addDaysToCalendarDate({ date: query.review_date_to, days: 1 }),
      },
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
