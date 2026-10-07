import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateOfferingSuggestionDto,
  type CreateOfferingSuggestionInput,
  listOfferingSuggestionsQueryDto,
  UpdateOfferingSuggestionDto,
  type UpdateOfferingSuggestionInput,
} from './offering-suggestions.dto.js';

/** Parses a offering suggestion create body; throws `ValidationError` naming each bad field. */
export function validateCreateOfferingSuggestion(data: unknown): CreateOfferingSuggestionInput {
  return parseWithSchema(CreateOfferingSuggestionDto, data);
}

/** Parses a offering suggestion update body; throws `ValidationError` naming each bad field. */
export function validateUpdateOfferingSuggestion(data: unknown): UpdateOfferingSuggestionInput {
  return parseWithSchema(UpdateOfferingSuggestionDto, data);
}

/** Parses the `GET /app/offering-suggestions` query into a list input (filters by column). */
export function validateListOfferingSuggestionsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listOfferingSuggestionsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      status: query.status,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
