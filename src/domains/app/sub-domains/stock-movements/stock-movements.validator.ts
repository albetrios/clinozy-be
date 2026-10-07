import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateStockMovementDto,
  type CreateStockMovementInput,
  listStockMovementsQueryDto,
  UpdateStockMovementDto,
  type UpdateStockMovementInput,
} from './stock-movements.dto.js';

/** Parses a stock movement create body; throws `ValidationError` naming each bad field. */
export function validateCreateStockMovement(data: unknown): CreateStockMovementInput {
  return parseWithSchema(CreateStockMovementDto, data);
}

/** Parses a stock movement update body; throws `ValidationError` naming each bad field. */
export function validateUpdateStockMovement(data: unknown): UpdateStockMovementInput {
  return parseWithSchema(UpdateStockMovementDto, data);
}

/** Parses the `GET /app/stock-movements` query into a list input (filters by column). */
export function validateListStockMovementsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listStockMovementsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      type: query.type,
    },
    referenceEquals: {
      stock_item_id: query.stock_item_id,
      patient_id: query.patient_id,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
