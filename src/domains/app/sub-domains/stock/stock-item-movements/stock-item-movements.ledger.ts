import { toText } from '@/shared/utils/validation/record-fields.util.js';
import {
  type BaseRecordRow,
  findMembershipIdOfUser,
} from '@/domains/app/base-record.repository.js';
import type { BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { StockItemsRepository } from '@/domains/app/sub-domains/stock/stock-items/stock-items.repository.js';
import { ConflictError } from '@/shared/errors/index.js';
import { StockItemMovementsRepository } from './stock-item-movements.repository.js';

const itemsRepository = new StockItemsRepository();
const movementsRepository = new StockItemMovementsRepository();

/** A stock quantity in thousandths — exact sums of `numeric(12,3)` values (S4). */
export function quantityMilli(value: unknown): number {
  return Math.round(Number(value ?? 0) * 1000);
}

/** Thousandths back to a quantity, as the `numeric(12,3)` text a write sends. */
export function quantityText(milli: number): string {
  return (milli / 1000).toFixed(3);
}

/**
 * S5: moves a live item's balance by `changeMilli` in one guarded statement and answers the
 * balance it left — below zero is a 409 `not_enough_stock` naming what is left.
 *
 * @remarks
 * - **Algorithm:** `UPDATE … SET quantity = quantity + change WHERE … AND quantity + change >= 0
 *   RETURNING quantity` — the guard and the write are one statement, so concurrent movements can
 *   never take it below zero.
 * - **Failure modes:** `ConflictError` `not_enough_stock`.
 */
export async function moveStock(options: {
  stockItemId: number;
  changeMilli: number;
}): Promise<number> {
  const after = await itemsRepository.moveQuantity({
    id: options.stockItemId,
    change: quantityText(options.changeMilli),
  });
  if (after !== null) return quantityMilli(after);
  const item = await itemsRepository.findById(options.stockItemId);
  throw new ConflictError('errors:stockNotEnough', {
    quantity: Number(item?.quantity ?? 0),
    unit: toText(item?.unit),
  }).withReason('not_enough_stock');
}

/** What one movement says beyond its item, type and change (S7, S8, S14). */
export interface StockMovementLinks {
  used_for?: string | null;
  note?: string | null;
  patient_treatment_id?: number | null;
  stock_purchase_id?: number | null;
  stock_count_id?: number | null;
  reverts_stock_item_movement_id?: number | null;
  revert_reason?: string | null;
}

/**
 * S5: writes one movement — the item's balance moved by `changeMilli` and the row that records it,
 * with the balance it left and the caller as its author (K2) — inside the caller's transaction.
 *
 * @remarks
 * - **Failure modes:** `ConflictError` `not_enough_stock`; a second revert of one movement violates
 *   `idx_stock_item_movements_reverts` (the caller maps it).
 */
export async function writeStockMovement(options: {
  context: BaseRecordWriteContext;
  stockItemId: number;
  type: string;
  changeMilli: number;
  links?: StockMovementLinks;
}): Promise<BaseRecordRow> {
  const { context } = options;
  const afterMilli = await moveStock({
    stockItemId: options.stockItemId,
    changeMilli: options.changeMilli,
  });
  return movementsRepository.insert({
    ...options.links,
    organization_id: context.organizationId,
    stock_item_id: options.stockItemId,
    type: options.type,
    quantity_change: quantityText(options.changeMilli),
    quantity_after: quantityText(afterMilli),
    author_membership_id: await findMembershipIdOfUser({
      organizationId: context.organizationId,
      userId: context.userId,
    }),
    created_by_user_id: context.userId,
  });
}
