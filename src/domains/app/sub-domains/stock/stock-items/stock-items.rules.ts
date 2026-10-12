import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import {
  quantityMilli,
  writeStockMovement,
} from '@/domains/app/sub-domains/stock/stock-item-movements/stock-item-movements.ledger.js';
import { STOCK_ITEM_MOVEMENT_TYPE } from '@/domains/app/sub-domains/stock/stock-item-movements/stock-item-movements.constants.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import {
  STOCK_ITEM_DEFAULT_MAX_QUANTITY,
  STOCK_ITEM_DEFAULT_MIN_QUANTITY,
} from './stock-items.constants.js';

/** The opening quantities in flight, by their write context — set by `prepareCreate`, read by `afterWrite`. */
const pendingOpenings = new WeakMap<BaseRecordWriteContext, number>();

/**
 * S6: the item's cross-field rules on the values a write would leave — the size and its measure
 * both or neither, the maximum never under the minimum (a new item's defaults 1 and 10).
 *
 * @remarks
 * - **Failure modes:** `ValidationError` on `size_per_unit`, `measure_unit`, `max_quantity`.
 */
export function assertStockItemValues(values: Record<string, unknown>): void {
  const hasSize = values.size_per_unit !== null && values.size_per_unit !== undefined;
  const hasMeasure = values.measure_unit !== null && values.measure_unit !== undefined;
  if (hasSize !== hasMeasure) {
    throw fieldValidationError({
      field: hasSize ? 'measure_unit' : 'size_per_unit',
      messageKey: 'errors:validation.stockItemSizeWithMeasure',
    });
  }
  const minimum = quantityMilli(values.min_quantity ?? STOCK_ITEM_DEFAULT_MIN_QUANTITY);
  const maximum = quantityMilli(values.max_quantity ?? STOCK_ITEM_DEFAULT_MAX_QUANTITY);
  if (maximum < minimum) {
    throw fieldValidationError({
      field: 'max_quantity',
      messageKey: 'errors:validation.stockItemMaxBelowMin',
    });
  }
}

/**
 * The stock item rules (launch ROUTE #137, routes-final 9.A, S6): the opening quantity as an
 * `opening` movement, and delete only at zero.
 *
 * @remarks
 * - **Algorithm:** a create takes `opening_quantity` out of the row and, once it is written, moves
 *   it in with an `opening` movement (S5 — the item starts at 0); after that the quantity changes
 *   only through a movement or a count. A delete is refused while any is left.
 * - **Failure modes:** `ConflictError` `item_has_stock`.
 */
export function createStockItemsRules(): BaseRecordRules {
  return {
    prepareCreate: (values, context) => {
      const opening = quantityMilli(values.opening_quantity);
      delete values.opening_quantity;
      if (opening > 0) pendingOpenings.set(context, opening);
    },
    afterWrite: async (row, change, context) => {
      if (change.kind !== 'create') return;
      const opening = pendingOpenings.get(context);
      pendingOpenings.delete(context);
      if (opening === undefined) return;
      await writeStockMovement({
        context,
        stockItemId: row.id,
        type: STOCK_ITEM_MOVEMENT_TYPE.OPENING,
        changeMilli: opening,
      });
    },
    prepareRemove: (existing) => {
      if (quantityMilli(existing.quantity) !== 0) {
        throw new ConflictError('errors:stockItemHasStock').withReason('item_has_stock');
      }
    },
  };
}
