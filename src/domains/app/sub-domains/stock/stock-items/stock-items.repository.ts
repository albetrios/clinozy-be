import { and, eq, gte, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository, nullsLastSortKeys } from '@/domains/app/base-record.repository.js';
import { STOCK_ITEM_LEVEL } from './stock-items.constants.js';
import { stock_items } from './stock-items.schema.js';

/** S6: how many days the stock lasts at the weekly usage — null without usage. */
const LASTS_DAYS = sql`CASE WHEN ${stock_items.usage_per_week} > 0 THEN floor(${stock_items.quantity} / ${stock_items.usage_per_week} * 7) END`;

/** S6: the condition of one derived stock level — `out` at 0, `low` up to the minimum, else `ok`. */
function stockLevelCondition(level: string): SQL {
  if (level === STOCK_ITEM_LEVEL.OUT) return sql`${stock_items.quantity} = 0`;
  if (level === STOCK_ITEM_LEVEL.LOW) {
    return sql`(${stock_items.quantity} > 0 AND ${stock_items.quantity} <= ${stock_items.min_quantity})`;
  }
  return sql`(${stock_items.quantity} > 0 AND ${stock_items.quantity} > ${stock_items.min_quantity})`;
}

/**
 * Persistence for `app.stock_items` (launch ROUTE #137, routes-final 9.A) — the shared app record
 * reads and writes, plus the guarded balance every movement moves (S5) and the latest purchase
 * rate (S10).
 *
 * @remarks
 * - **Algorithm:** `q` on the name or the number (`#167`); sorts `name` (default, A–Z),
 *   `stock_item_number`, `category` (then name), `quantity`, `lasts_days` (none last) and
 *   `created_at`; the `stock_level` filter is derived (`out` · `low` · `ok`), and so is
 *   `lasts_days_to` (lasts at most that many days — none without usage, D81). The balance moves in
 *   one guarded statement — never below 0 — and leaves `updated_at` alone: a movement is not a
 *   change to the item's details (D43 stays about them).
 */
export class StockItemsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: stock_items,
      entity: 'stockItem',
      searchColumns: ['name'],
      numberColumn: 'stock_item_number',
      sortColumns: { created_at: 'created_at', name: 'text' },
      sortKeys: {
        stock_item_number: { keys: [{ value: 'stock_item_number' }], defaultOrder: 'desc' },
        category: { keys: [{ value: 'category' }, { value: 'name' }], defaultOrder: 'asc' },
        quantity: { keys: [{ value: 'quantity' }], defaultOrder: 'asc' },
        // An item without a weekly usage comes last in either order
        lasts_days: {
          keys: nullsLastSortKeys({
            value: () => LASTS_DAYS,
            sqlType: 'numeric',
            empty: sql`0::numeric`,
            defaultOrder: 'asc',
          }),
          defaultOrder: 'asc',
        },
      },
      derivedFilters: {
        stock_level: (value) =>
          sql`(${sql.join(
            (value as string[]).map((level) => stockLevelCondition(level)),
            sql` OR `,
          )})`,
        // D81: runs out within N days — an item without a weekly usage never does
        lasts_days_to: (value) => sql`${LASTS_DAYS} <= ${value as number}`,
      },
      defaultSort: 'name',
      defaultOrder: 'asc',
    });
  }

  /**
   * S5: moves a live item's balance by `change` (a `numeric(12,3)` text) — the balance it left, or
   * null when it would go below 0 (or the item is gone).
   */
  async moveQuantity(options: { id: number; change: string }): Promise<string | null> {
    const moved = sql`${stock_items.quantity} + ${options.change}::numeric`;
    const rows = await getRequestDatabase()
      .update(stock_items)
      .set({ quantity: moved } as never)
      .where(and(eq(stock_items.id, options.id), isNull(stock_items.deleted_at), gte(moved, 0)))
      .returning({ quantity: stock_items.quantity });
    return rows[0]?.quantity ?? null;
  }

  /** S5: a live item's balance, its row taken `FOR UPDATE` until the transaction ends (null when gone). */
  async lockQuantity(id: number): Promise<string | null> {
    const rows = await getRequestDatabase()
      .select({ quantity: stock_items.quantity })
      .from(stock_items)
      .where(and(eq(stock_items.id, id), isNull(stock_items.deleted_at)))
      .for('update');
    return rows[0]?.quantity ?? null;
  }

  /** The balances of live items by id, for a count's system quantities (S9). */
  async findQuantities(ids: readonly number[]): Promise<Map<number, string>> {
    if (ids.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ id: stock_items.id, quantity: stock_items.quantity })
      .from(stock_items)
      .where(and(inArray(stock_items.id, [...ids]), isNull(stock_items.deleted_at)))
      .for('update');
    return new Map(rows.map((row) => [row.id, row.quantity]));
  }

  /** S10: the latest purchase line's rate. */
  async setLastRate(options: { id: number; rate: string }): Promise<void> {
    await getRequestDatabase()
      .update(stock_items)
      .set({ last_rate: options.rate })
      .where(eq(stock_items.id, options.id));
  }
}
