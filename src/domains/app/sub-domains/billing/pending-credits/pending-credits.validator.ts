import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { addDaysToCalendarDate } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePendingCreditDto,
  type CreatePendingCreditInput,
  listPendingCreditsQueryDto,
  UpdatePendingCreditDto,
  type UpdatePendingCreditInput,
} from './pending-credits.dto.js';

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses a pending-credit create body; throws `ValidationError` naming each bad field. */
export function validateCreatePendingCredit(data: unknown): CreatePendingCreditInput {
  return parseWithSchema(CreatePendingCreditDto, data);
}

/** Parses a pending-credit change body; throws `ValidationError` naming each bad field. */
export function validateUpdatePendingCredit(data: unknown): UpdatePendingCreditInput {
  return parseWithSchema(UpdatePendingCreditDto, data);
}

/** Parses the pending-credit list query into a list input (routes-final 8.D.8 #21). */
export function validateListPendingCreditsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPendingCreditsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      direction: query.direction,
      status: query.status?.split(','),
    },
    referenceEquals: {
      contact_id: query.contact_id,
      invoice_id: query.invoice_id,
    },
    ranges: {
      settle_by: {
        from: query.settle_by_from,
        to:
          query.settle_by_to === undefined
            ? undefined
            : addDaysToCalendarDate({ date: query.settle_by_to, days: 1 }),
      },
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}
