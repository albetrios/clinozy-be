import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  queryInstantRange,
  splitRecordIds,
  withInstants,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePaymentDto,
  type CreatePaymentInput,
  listPaymentsQueryDto,
  UpdatePaymentDto,
  type UpdatePaymentInput,
} from './payments.dto.js';

/** Parses a payment create body; throws `ValidationError` naming each bad field. */
export function validateCreatePayment(data: unknown): CreatePaymentInput {
  return withInstants({
    values: parseWithSchema({ schema: CreatePaymentDto, data }),
    fields: ['paid_at'],
  });
}

/** Parses a payment change body; throws `ValidationError` naming each bad field. */
export function validateUpdatePayment(data: unknown): UpdatePaymentInput {
  return withInstants({
    values: parseWithSchema({ schema: UpdatePaymentDto, data }),
    fields: ['paid_at'],
  });
}

/** Parses the ledger query into a list input (routes-final 8.C.8 #12, #13). */
export function validateListPaymentsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listPaymentsQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      direction: query.direction,
      kind: query.kind?.split(','),
      expense_category: query.expense_category?.split(','),
    },
    referenceEquals: {
      contact_id: query.contact_id,
      invoice_id: query.invoice_id,
      pending_credit_id: query.pending_credit_id,
      stock_purchase_id: query.stock_purchase_id,
      medical_purchase_order_id: query.medical_purchase_order_id,
    },
    branchPublicIds: query.branch_id === undefined ? undefined : splitRecordIds(query.branch_id),
    derived: {
      mode: query.mode?.split(','),
      patient_id: query.patient_id,
      paid_date_from: query.paid_date_from,
      paid_date_to: query.paid_date_to,
      is_settled: query.is_settled === undefined ? undefined : query.is_settled === 'true',
    },
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
