import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateSupplierCreditDto,
  type CreateSupplierCreditInput,
  listSupplierCreditsQueryDto,
} from './supplier-credits.dto.js';

/** Parses a "Return expiring stock" body; throws `ValidationError` naming each bad field. */
export function validateCreateSupplierCredit(data: unknown): CreateSupplierCreditInput {
  return parseWithSchema(CreateSupplierCreditDto, data);
}

/** A supplier credit is never changed (MD11) — there is no change route. */
export function refuseSupplierCreditUpdate(): Record<string, unknown> {
  throw new Error('supplier credits are never changed');
}

/** Parses the credits list's query into a list input (routes-final 11.C.8 #14). */
export function validateListSupplierCreditsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listSupplierCreditsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    referenceEquals: { supplier_id: query.supplier_id, medicine_id: query.medicine_id },
    derived: { status: query.status },
  };
}
