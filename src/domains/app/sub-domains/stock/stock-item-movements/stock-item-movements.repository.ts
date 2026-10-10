import { and, asc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { stock_purchases } from '@/domains/app/sub-domains/stock/stock-purchases/stock-purchases.schema.js';
import { STOCK_ITEM_MOVEMENT_TYPE } from './stock-item-movements.constants.js';
import { stock_item_movements } from './stock-item-movements.schema.js';

/** The movement a `reverted` row undid — joined to its revert for the row's text. */
const revertedMovement = alias(stock_item_movements, 'reverted_stock_item_movement');

/** What a movement row says beside its own columns (D81): its purchase, and what it reverted. */
export interface StockItemMovementLinkedText {
  /** The purchase's number (`#16`) — on a row with a purchase (a receipt and its revert). */
  stock_purchase_number: number | null;
  /** The purchase's bill number, when it has one. */
  bill_number: string | null;
  /** The type of the movement a `reverted` row undid. */
  reverts_type: string | null;
  /** When that movement was written. */
  reverts_created_at: Date | null;
}

/**
 * Persistence for `app.stock_item_movements` (launch ROUTE #137, routes-final 9.B) — append-only:
 * the shared reads and the insert, plus what reverted each movement (S8) and the text a row shows
 * from its purchase and the movement it reverted (D81).
 *
 * @remarks
 * - **Algorithm:** lists newest first (`created_at`, then id); no search. Never updated or
 *   soft-deleted — a wrong movement is reverted by another row.
 */
export class StockItemMovementsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: stock_item_movements,
      entity: 'stockItemMovement',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }

  /** S8: the revert of each movement by its id → the revert's public id (none reverted are absent). */
  async findReverts(ids: readonly number[]): Promise<Map<number, string>> {
    if (ids.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        reverts: stock_item_movements.reverts_stock_item_movement_id,
        public_id: stock_item_movements.public_id,
      })
      .from(stock_item_movements)
      .where(inArray(stock_item_movements.reverts_stock_item_movement_id, [...ids]));
    return new Map(
      rows.flatMap((row) => (row.reverts === null ? [] : [[row.reverts, row.public_id] as const])),
    );
  }

  /**
   * D81: the text each movement row shows from what it points at — its purchase's number and bill
   * number, and the type and time of the movement a revert undid — by movement id, in one read
   * (a purchase since deleted still names itself; a row pointing at neither is absent).
   */
  async findLinkedTexts(ids: readonly number[]): Promise<Map<number, StockItemMovementLinkedText>> {
    if (ids.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        id: stock_item_movements.id,
        stock_purchase_number: stock_purchases.stock_purchase_number,
        bill_number: stock_purchases.bill_number,
        reverts_type: revertedMovement.type,
        reverts_created_at: revertedMovement.created_at,
      })
      .from(stock_item_movements)
      .leftJoin(stock_purchases, eq(stock_purchases.id, stock_item_movements.stock_purchase_id))
      .leftJoin(
        revertedMovement,
        eq(revertedMovement.id, stock_item_movements.reverts_stock_item_movement_id),
      )
      .where(inArray(stock_item_movements.id, [...ids]));
    const texts = new Map<number, StockItemMovementLinkedText>();
    for (const { id, ...text } of rows) {
      if (text.stock_purchase_number !== null || text.reverts_type !== null) texts.set(id, text);
    }
    return texts;
  }

  /** S8: whether a movement was reverted already. */
  async hasRevert(id: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: stock_item_movements.id })
      .from(stock_item_movements)
      .where(eq(stock_item_movements.reverts_stock_item_movement_id, id))
      .limit(1);
    return rows.length > 0;
  }

  /** S12: a purchase's `received` movements not reverted yet — what deleting it takes back. */
  async findUnrevertedOfPurchase(
    stockPurchaseId: number,
  ): Promise<{ id: number; stock_item_id: number; quantity_change: string }[]> {
    const received = await getRequestDatabase()
      .select({
        id: stock_item_movements.id,
        stock_item_id: stock_item_movements.stock_item_id,
        quantity_change: stock_item_movements.quantity_change,
      })
      .from(stock_item_movements)
      .where(
        and(
          eq(stock_item_movements.stock_purchase_id, stockPurchaseId),
          eq(stock_item_movements.type, STOCK_ITEM_MOVEMENT_TYPE.RECEIVED),
        ),
      )
      .orderBy(asc(stock_item_movements.id));
    const reverted = await this.findReverts(received.map((row) => row.id));
    return received.filter((row) => !reverted.has(row.id));
  }
}
