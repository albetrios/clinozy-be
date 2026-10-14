import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePatientOfferingSuggestionDto,
  type CreatePatientOfferingSuggestionInput,
  listPatientOfferingSuggestionsQueryDto,
  UpdatePatientOfferingSuggestionDto,
  type UpdatePatientOfferingSuggestionInput,
} from './patient-offering-suggestions.dto.js';

/** Parses a plan row create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientOfferingSuggestion(
  data: unknown,
): CreatePatientOfferingSuggestionInput {
  return parseWithSchema({ schema: CreatePatientOfferingSuggestionDto, data });
}

/** Parses a plan row update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientOfferingSuggestion(
  data: unknown,
): UpdatePatientOfferingSuggestionInput {
  return parseWithSchema({ schema: UpdatePatientOfferingSuggestionDto, data });
}

/** Parses a patient's plan query into a list input (routes-final 7.M.8 #68). */
export function validateListPatientOfferingSuggestionsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listPatientOfferingSuggestionsQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    equals: {
      status: query.status?.split(','),
    },
    referenceEquals: {
      appointment_id: query.appointment_id,
      patient_check_in_id: query.patient_check_in_id,
    },
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
