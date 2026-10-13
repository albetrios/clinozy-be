import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateSupplierDto,
  type CreateSupplierInput,
  listSuppliersQueryDto,
  UpdateSupplierDto,
  type UpdateSupplierInput,
} from './suppliers.dto.js';

/** Parses a supplier create body; throws `ValidationError` naming each bad field. */
export function validateCreateSupplier(data: unknown): CreateSupplierInput {
  return parseWithSchema({ schema: CreateSupplierDto, data });
}

/** Parses a supplier change body; throws `ValidationError` naming each bad field. */
export function validateUpdateSupplier(data: unknown): UpdateSupplierInput {
  return parseWithSchema({ schema: UpdateSupplierDto, data });
}

/** Parses the Suppliers tab's query into a list input (routes-final 11.B.8 #7). */
export function validateListSuppliersQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listSuppliersQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    linkEquals: { manufacturer_ids: query.manufacturer_id },
    derived: {
      has_payable: query.has_payable === undefined ? undefined : query.has_payable === 'true',
    },
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
