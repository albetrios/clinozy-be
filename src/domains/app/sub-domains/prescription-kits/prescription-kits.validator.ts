import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreatePrescriptionKitDto,
  type CreatePrescriptionKitInput,
  listPrescriptionKitsQueryDto,
  UpdatePrescriptionKitDto,
  type UpdatePrescriptionKitInput,
} from './prescription-kits.dto.js';

/** Parses a prescription kit create body; throws `ValidationError` naming each bad field. */
export function validateCreatePrescriptionKit(data: unknown): CreatePrescriptionKitInput {
  return parseWithSchema(CreatePrescriptionKitDto, data);
}

/** Parses a prescription kit update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePrescriptionKit(data: unknown): UpdatePrescriptionKitInput {
  return parseWithSchema(UpdatePrescriptionKitDto, data);
}

/** Parses the `GET /app/prescription-kits` query into a list input (filters by column). */
export function validateListPrescriptionKitsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPrescriptionKitsQueryDto, data);
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
