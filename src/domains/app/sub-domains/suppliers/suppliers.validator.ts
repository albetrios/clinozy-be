import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateSupplierDto,
  type CreateSupplierInput,
  listSuppliersQueryDto,
  UpdateSupplierDto,
  type UpdateSupplierInput,
} from './suppliers.dto.js';

/** Parses a supplier create body; throws `ValidationError` naming each bad field. */
export function validateCreateSupplier(data: unknown): CreateSupplierInput {
  return parseWithSchema(CreateSupplierDto, data);
}

/** Parses a supplier update body; throws `ValidationError` naming each bad field. */
export function validateUpdateSupplier(data: unknown): UpdateSupplierInput {
  return parseWithSchema(UpdateSupplierDto, data);
}

/** Parses the `GET /app/suppliers` query into a list input (filters by column). */
export function validateListSuppliersQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listSuppliersQueryDto, data);
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
