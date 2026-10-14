import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateMedicalRepDto,
  type CreateMedicalRepInput,
  listMedicalRepsQueryDto,
  UpdateMedicalRepDto,
  type UpdateMedicalRepInput,
} from './medical-reps.dto.js';

/** Parses an MR create body; throws `ValidationError` naming each bad field. */
export function validateCreateMedicalRep(data: unknown): CreateMedicalRepInput {
  return parseWithSchema({ schema: CreateMedicalRepDto, data });
}

/** Parses an MR change body; throws `ValidationError` naming each bad field. */
export function validateUpdateMedicalRep(data: unknown): UpdateMedicalRepInput {
  return parseWithSchema({ schema: UpdateMedicalRepDto, data });
}

/** Parses the MRs tab's query into a list input (routes-final 11.F.8 #33). */
export function validateListMedicalRepsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listMedicalRepsQueryDto, data });
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
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
