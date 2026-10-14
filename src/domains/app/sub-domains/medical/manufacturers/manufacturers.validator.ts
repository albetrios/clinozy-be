import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateManufacturerDto,
  type CreateManufacturerInput,
  listManufacturersQueryDto,
  UpdateManufacturerDto,
  type UpdateManufacturerInput,
} from './manufacturers.dto.js';

/** Parses a manufacturer create body; throws `ValidationError` naming each bad field. */
export function validateCreateManufacturer(data: unknown): CreateManufacturerInput {
  return parseWithSchema({ schema: CreateManufacturerDto, data });
}

/** Parses a manufacturer change body; throws `ValidationError` naming each bad field. */
export function validateUpdateManufacturer(data: unknown): UpdateManufacturerInput {
  return parseWithSchema({ schema: UpdateManufacturerDto, data });
}

/** Parses the Manufacturers tab's query into a list input (routes-final 11.A.8 #1). */
export function validateListManufacturersQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listManufacturersQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    linkEquals: { supplier_ids: query.supplier_id, medical_rep_ids: query.medical_rep_id },
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
