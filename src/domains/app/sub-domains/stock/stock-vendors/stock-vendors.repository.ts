import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { stock_purchases } from '@/domains/app/sub-domains/stock/stock-purchases/stock-purchases.schema.js';
import { stock_vendors } from './stock-vendors.schema.js';

/**
 * Persistence for `app.stock_vendors` (launch ROUTE #137, routes-final 9.E) — the shared app
 * record reads and writes, plus what each vendor is owed.
 *
 * @remarks
 * - **Algorithm:** `q` on the name; sorts `name` (A–Z first) and `created_at`. The payable is one
 *   `GROUP BY` over the live purchases with a due (S13).
 */
export class StockVendorsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: stock_vendors,
      entity: 'stockVendor',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'name',
      defaultOrder: 'asc',
    });
  }

  /** S13: the open dues of each vendor's live purchases, rupees (a vendor owed nothing is absent). */
  async findPayables(vendorIds: readonly number[]): Promise<Map<number, number>> {
    if (vendorIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        stock_vendor_id: stock_purchases.stock_vendor_id,
        payable: sql<string>`sum(${stock_purchases.due_amount})`,
      })
      .from(stock_purchases)
      .where(
        and(
          inArray(stock_purchases.stock_vendor_id, [...vendorIds]),
          isNull(stock_purchases.deleted_at),
          gt(stock_purchases.due_amount, '0'),
        ),
      )
      .groupBy(stock_purchases.stock_vendor_id);
    return new Map(rows.map((row) => [row.stock_vendor_id, Number(row.payable)]));
  }

  /** S13: whether a live purchase of the vendor is not fully paid. */
  async hasDues(vendorId: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: stock_purchases.id })
      .from(stock_purchases)
      .where(
        and(
          eq(stock_purchases.stock_vendor_id, vendorId),
          isNull(stock_purchases.deleted_at),
          gt(stock_purchases.due_amount, '0'),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
