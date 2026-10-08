import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateMedicalRepDto,
  type CreateMedicalRepInput,
  listMedicalRepsQueryDto,
  UpdateMedicalRepDto,
  type UpdateMedicalRepInput,
} from './medical-reps.dto.js';

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses an MR create body; throws `ValidationError` naming each bad field. */
export function validateCreateMedicalRep(data: unknown): CreateMedicalRepInput {
  return parseWithSchema(CreateMedicalRepDto, data);
}

/** Parses an MR change body; throws `ValidationError` naming each bad field. */
export function validateUpdateMedicalRep(data: unknown): UpdateMedicalRepInput {
  return parseWithSchema(UpdateMedicalRepDto, data);
}

/** Parses the MRs tab's query into a list input (routes-final 11.F.8 #33). */
export function validateListMedicalRepsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listMedicalRepsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    linkEquals: { manufacturer_ids: query.manufacturer_id },
    derived: {
      is_visit_overdue:
        query.is_visit_overdue === undefined ? undefined : query.is_visit_overdue === 'true',
    },
    ranges: {
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}
