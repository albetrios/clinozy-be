import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateMedicineDto,
  type CreateMedicineInput,
  listMedicinesQueryDto,
  UpdateMedicineDto,
  type UpdateMedicineInput,
} from './medicines.dto.js';

/** Parses a medicine create body; throws `ValidationError` naming each bad field. */
export function validateCreateMedicine(data: unknown): CreateMedicineInput {
  return parseWithSchema(CreateMedicineDto, data);
}

/** Parses a medicine update body; throws `ValidationError` naming each bad field. */
export function validateUpdateMedicine(data: unknown): UpdateMedicineInput {
  return parseWithSchema(UpdateMedicineDto, data);
}

/** Parses the `GET /app/medicines` query into a list input (filters by column). */
export function validateListMedicinesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listMedicinesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    referenceEquals: {
      manufacturer_id: query.manufacturer_id,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
