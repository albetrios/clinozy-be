import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateMedicalPurchaseOrderDto,
  type CreateMedicalPurchaseOrderInput,
  listMedicalPurchaseOrdersQueryDto,
  UpdateMedicalPurchaseOrderDto,
  type UpdateMedicalPurchaseOrderInput,
  cancelMedicalPurchaseOrderDto,
} from './medical-purchase-orders.dto.js';

/** Parses a purchase order create body; throws `ValidationError` naming each bad field. */
export function validateCreateMedicalPurchaseOrder(data: unknown): CreateMedicalPurchaseOrderInput {
  return parseWithSchema(CreateMedicalPurchaseOrderDto, data);
}

/** Parses a purchase order update body; throws `ValidationError` naming each bad field. */
export function validateUpdateMedicalPurchaseOrder(data: unknown): UpdateMedicalPurchaseOrderInput {
  return parseWithSchema(UpdateMedicalPurchaseOrderDto, data);
}

/** Parses the `GET /app/medical-purchase-orders` query into a list input (filters by column). */
export function validateListMedicalPurchaseOrdersQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listMedicalPurchaseOrdersQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      stage: query.stage,
    },
    referenceEquals: {
      supplier_id: query.supplier_id,
    },
    ranges: {
      order_date: { from: query.order_date_from, to: query.order_date_to },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}

/** Parses the body of the `cancel` action. */
export function validateCancelMedicalPurchaseOrder(data: unknown): Record<string, unknown> {
  return parseWithSchema(cancelMedicalPurchaseOrderDto, data ?? {});
}
