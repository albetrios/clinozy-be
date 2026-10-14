import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange, splitRecordIds } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateMedicineDto,
  type CreateMedicineInput,
  listMedicinesQueryDto,
  UpdateMedicineDto,
  type UpdateMedicineInput,
} from './medicines.dto.js';

/** Parses a medicine create body; throws `ValidationError` naming each bad field. */
export function validateCreateMedicine(data: unknown): CreateMedicineInput {
  return parseWithSchema({ schema: CreateMedicineDto, data });
}

/** Parses a medicine change body; throws `ValidationError` naming each bad field. */
export function validateUpdateMedicine(data: unknown): UpdateMedicineInput {
  return parseWithSchema({ schema: UpdateMedicineDto, data });
}

/** Parses the Medicines tab's (and export's) query into a list input (routes-final 11.D.8 #17). */
export function validateListMedicinesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listMedicinesQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: { is_quick: query.is_quick === undefined ? undefined : query.is_quick === 'true' },
    derived: {
      manufacturer_ids:
        query.manufacturer_id === undefined ? undefined : splitRecordIds(query.manufacturer_id),
      stock_level: query.stock_level?.split(','),
      expiring_within_days:
        query.expiring_within_days === undefined ? undefined : Number(query.expiring_within_days),
      supplier_id: query.supplier_id,
    },
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
