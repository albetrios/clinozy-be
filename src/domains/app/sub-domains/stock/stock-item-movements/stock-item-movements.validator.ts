import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateStockItemMovementDto,
  type CreateStockItemMovementInput,
  listStockItemMovementsQueryDto,
} from './stock-item-movements.dto.js';

/** Parses a movement by hand; throws `ValidationError` naming each bad field. */
export function validateCreateStockItemMovement(data: unknown): CreateStockItemMovementInput {
  return parseWithSchema({ schema: CreateStockItemMovementDto, data });
}

/** A movement is never changed (S5) — there is no change route. */
export function refuseStockItemMovementUpdate(): Record<string, unknown> {
  throw new Error('stock item movements are never changed');
}

/** Parses the Movements tab's query (or an item's history) into a list input (9.B.8 #8, #9). */
export function validateListStockItemMovementsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listStockItemMovementsQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    equals: { type: query.type?.split(',') },
    referenceEquals: {
      stock_item_id: query.stock_item_id,
      patient_treatment_id: query.patient_treatment_id,
      author_membership_id: query.author_membership_id,
    },
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
