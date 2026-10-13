import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePrescriptionKitDto,
  type CreatePrescriptionKitInput,
  listPrescriptionKitsQueryDto,
  UpdatePrescriptionKitDto,
  type UpdatePrescriptionKitInput,
} from './prescription-kits.dto.js';

/** Parses a kit create body; throws `ValidationError` naming each bad field. */
export function validateCreatePrescriptionKit(data: unknown): CreatePrescriptionKitInput {
  return parseWithSchema({ schema: CreatePrescriptionKitDto, data });
}

/** Parses a kit update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePrescriptionKit(data: unknown): UpdatePrescriptionKitInput {
  return parseWithSchema({ schema: UpdatePrescriptionKitDto, data });
}

/** Parses the `GET /app/prescription-kits` query into a list input (routes-final 7.D.8 #21). */
export function validateListPrescriptionKitsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listPrescriptionKitsQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
