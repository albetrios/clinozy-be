import { and, asc, eq, inArray } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { STOCK_ITEM_MOVEMENT_TYPE } from './stock-item-movements.constants.js';
import { stock_item_movements } from './stock-item-movements.schema.js';

/**
 * Persistence for `app.stock_item_movements` (launch ROUTE #137, routes-final 9.B) — append-only:
 * the shared reads and the insert, plus what reverted each movement (S8).
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
