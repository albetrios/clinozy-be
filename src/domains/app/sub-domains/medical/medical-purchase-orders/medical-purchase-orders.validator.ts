import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { addDaysToCalendarDate } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateMedicalPurchaseOrderDto,
  type CreateMedicalPurchaseOrderInput,
  listMedicalPurchaseOrdersQueryDto,
  UpdateMedicalPurchaseOrderDto,
  type UpdateMedicalPurchaseOrderInput,
} from './medical-purchase-orders.dto.js';

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses an order create body; throws `ValidationError` naming each bad field. */
export function validateCreateMedicalPurchaseOrder(data: unknown): CreateMedicalPurchaseOrderInput {
  return parseWithSchema({ schema: CreateMedicalPurchaseOrderDto, data });
}

/** Parses an order change body; throws `ValidationError` naming each bad field. */
export function validateUpdateMedicalPurchaseOrder(data: unknown): UpdateMedicalPurchaseOrderInput {
  return parseWithSchema({ schema: UpdateMedicalPurchaseOrderDto, data });
}

/** Parses the Purchases tab's (and CSV's) query into a list input (routes-final 11.E.8 #25). */
export function validateListMedicalPurchaseOrdersQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listMedicalPurchaseOrdersQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: { stage: query.stage?.split(','), payment_status: query.payment_status?.split(',') },
    referenceEquals: { supplier_id: query.supplier_id },
    ranges: {
      order_date: {
        from: query.order_date_from,
        to:
          query.order_date_to === undefined
            ? undefined
            : addDaysToCalendarDate({ date: query.order_date_to, days: 1 }),
      },
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}
