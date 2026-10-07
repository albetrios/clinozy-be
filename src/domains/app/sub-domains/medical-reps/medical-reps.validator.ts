import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateMedicalRepDto,
  type CreateMedicalRepInput,
  listMedicalRepsQueryDto,
  UpdateMedicalRepDto,
  type UpdateMedicalRepInput,
} from './medical-reps.dto.js';

/** Parses a medical rep create body; throws `ValidationError` naming each bad field. */
export function validateCreateMedicalRep(data: unknown): CreateMedicalRepInput {
  return parseWithSchema(CreateMedicalRepDto, data);
}

/** Parses a medical rep update body; throws `ValidationError` naming each bad field. */
export function validateUpdateMedicalRep(data: unknown): UpdateMedicalRepInput {
  return parseWithSchema(UpdateMedicalRepDto, data);
}

/** Parses the `GET /app/medical-reps` query into a list input (filters by column). */
export function validateListMedicalRepsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listMedicalRepsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    ranges: {
      next_visit_on: { from: query.next_visit_on_from, to: query.next_visit_on_to },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
