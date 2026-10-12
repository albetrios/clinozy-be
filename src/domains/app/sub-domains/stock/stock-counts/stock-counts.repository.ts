import { asc, eq, inArray } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { stock_items } from '@/domains/app/sub-domains/stock/stock-items/stock-items.schema.js';
import { stock_count_lines, stock_counts } from './stock-counts.schema.js';

/** One counted line as a count reads it — the item's public id joined in (S9). */
export interface StockCountLineRow {
  stock_count_id: number;
  stock_item_id: string;
  system_quantity: string;
  counted_quantity: string;
}

/**
 * Persistence for `app.stock_counts` and its lines (launch ROUTE #137, routes-final 9.C) — the
 * shared reads and the insert, plus the counted lines.
 *
 * @remarks
 * - **Algorithm:** lists by `counted_at` (default, newest first) or `created_at`; no search. Never
 *   changed or deleted (S9).
 */
export class StockCountsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: stock_counts,
      entity: 'stockCount',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      sortKeys: {
        counted_at: { keys: [{ value: 'counted_at' }], defaultOrder: 'desc' },
      },
      defaultSort: 'counted_at',
      defaultOrder: 'desc',
    });
  }

  /** S9: writes a count's lines. */
  async insertLines(
    rows: readonly {
      stock_count_id: number;
      stock_item_id: number;
      organization_id: number;
      system_quantity: string;
      counted_quantity: string;
    }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await getRequestDatabase()
      .insert(stock_count_lines)
      .values([...rows]);
  }

  /** S9: the lines of a page of counts, in item order. */
  async findLines(countIds: readonly number[]): Promise<StockCountLineRow[]> {
    if (countIds.length === 0) return [];
    return getRequestDatabase()
      .select({
        stock_count_id: stock_count_lines.stock_count_id,
        stock_item_id: stock_items.public_id,
        system_quantity: stock_count_lines.system_quantity,
        counted_quantity: stock_count_lines.counted_quantity,
      })
      .from(stock_count_lines)
      .innerJoin(stock_items, eq(stock_items.id, stock_count_lines.stock_item_id))
      .where(inArray(stock_count_lines.stock_count_id, [...countIds]))
      .orderBy(asc(stock_count_lines.stock_count_id), asc(stock_items.name));
  }
}
