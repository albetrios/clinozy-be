import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateMedicalRepVisitDto,
  type CreateMedicalRepVisitInput,
  listMedicalRepVisitsQueryDto,
  UpdateMedicalRepVisitDto,
  type UpdateMedicalRepVisitInput,
} from './medical-rep-visits.dto.js';

/** Parses a medical rep visit create body; throws `ValidationError` naming each bad field. */
export function validateCreateMedicalRepVisit(data: unknown): CreateMedicalRepVisitInput {
  return parseWithSchema(CreateMedicalRepVisitDto, data);
}

/** Parses a medical rep visit update body; throws `ValidationError` naming each bad field. */
export function validateUpdateMedicalRepVisit(data: unknown): UpdateMedicalRepVisitInput {
  return parseWithSchema(UpdateMedicalRepVisitDto, data);
}

/** Parses the `GET /app/medical-rep-visits` query into a list input (filters by column). */
export function validateListMedicalRepVisitsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listMedicalRepVisitsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
