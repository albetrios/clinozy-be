import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { splitRecordIds, withInstants } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePaymentDto,
  type CreatePaymentInput,
  listPaymentsQueryDto,
  UpdatePaymentDto,
  type UpdatePaymentInput,
} from './payments.dto.js';

/** Parses a payment create body; throws `ValidationError` naming each bad field. */
export function validateCreatePayment(data: unknown): CreatePaymentInput {
  return withInstants(parseWithSchema(CreatePaymentDto, data), ['paid_at']);
}

/** Parses a payment update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePayment(data: unknown): UpdatePaymentInput {
  return withInstants(parseWithSchema(UpdatePaymentDto, data), ['paid_at']);
}

/** Parses the `GET /app/payments` query into a list input (filters by column). */
export function validateListPaymentsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPaymentsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    branchPublicIds: splitRecordIds(query.branch_ids),
    equals: {
      direction: query.direction,
      kind: query.kind,
      expense_category: query.expense_category,
    },
    referenceEquals: {
      branch_id: query.branch_id,
      patient_id: query.patient_id,
      invoice_id: query.invoice_id,
      day_close_id: query.day_close_id,
    },
    ranges: {
      paid_at: {
        from: query.paid_at_from === undefined ? undefined : new Date(query.paid_at_from),
        to: query.paid_at_to === undefined ? undefined : new Date(query.paid_at_to),
      },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
