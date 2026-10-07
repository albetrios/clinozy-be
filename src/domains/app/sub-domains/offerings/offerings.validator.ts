import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateOfferingDto,
  type CreateOfferingInput,
  listOfferingsQueryDto,
  UpdateOfferingDto,
  type UpdateOfferingInput,
} from './offerings.dto.js';

/** Parses a offering create body; throws `ValidationError` naming each bad field. */
export function validateCreateOffering(data: unknown): CreateOfferingInput {
  return parseWithSchema(CreateOfferingDto, data);
}

/** Parses a offering update body; throws `ValidationError` naming each bad field. */
export function validateUpdateOffering(data: unknown): UpdateOfferingInput {
  return parseWithSchema(UpdateOfferingDto, data);
}

/** Parses the `GET /app/offerings` query into a list input (filters by column). */
export function validateListOfferingsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listOfferingsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      category: query.category,
      specialty: query.specialty,
      is_active: query.is_active === undefined ? undefined : query.is_active === 'true',
    },
    referenceEquals: {
      group_id: query.group_id,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
