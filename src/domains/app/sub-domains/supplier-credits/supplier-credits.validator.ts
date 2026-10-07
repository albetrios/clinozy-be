import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateSupplierCreditDto,
  type CreateSupplierCreditInput,
  listSupplierCreditsQueryDto,
  UpdateSupplierCreditDto,
  type UpdateSupplierCreditInput,
} from './supplier-credits.dto.js';

/** Parses a supplier credit create body; throws `ValidationError` naming each bad field. */
export function validateCreateSupplierCredit(data: unknown): CreateSupplierCreditInput {
  return parseWithSchema(CreateSupplierCreditDto, data);
}

/** Parses a supplier credit update body; throws `ValidationError` naming each bad field. */
export function validateUpdateSupplierCredit(data: unknown): UpdateSupplierCreditInput {
  return parseWithSchema(UpdateSupplierCreditDto, data);
}

/** Parses the `GET /app/supplier-credits` query into a list input (filters by column). */
export function validateListSupplierCreditsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listSupplierCreditsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    referenceEquals: {
      supplier_id: query.supplier_id,
      medicine_id: query.medicine_id,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
