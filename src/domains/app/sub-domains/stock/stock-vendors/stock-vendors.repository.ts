import { and, eq, gt, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  type BaseRecordListQuery,
  BaseRecordRepository,
} from '@/domains/app/base-record.repository.js';
import { stock_purchases } from '@/domains/app/sub-domains/stock/stock-purchases/stock-purchases.schema.js';
import { stock_vendors } from './stock-vendors.schema.js';

/**
 * S13: a vendor row's payable — the open dues of its live purchases, 0 when owed nothing (the sort
 * key of `sort=payable`, D81, and each row's share of `meta.payable_total`).
 */
const STOCK_VENDOR_PAYABLE: SQL = sql`(select coalesce(sum(${stock_purchases.due_amount}), 0) from ${stock_purchases} where ${stock_purchases.stock_vendor_id} = ${stock_vendors.id} and ${stock_purchases.deleted_at} is null and ${stock_purchases.due_amount} > 0)`;

/** What a vendor row adds from its purchases (S13, D81). */
export interface StockVendorPurchaseFigures {
  /** The open dues of its live purchases, rupees. */
  payable: number;
  /** How many live purchases it has, paid or not. */
  purchase_count: number;
}

/**
 * Persistence for `app.stock_vendors` (launch ROUTE #137, routes-final 9.E) — the shared app
 * record reads and writes, plus what each vendor is owed and how many purchases it has.
 *
 * @remarks
 * - **Algorithm:** `q` on the name; sorts `name` (A–Z first), `created_at` and `payable` (most owed
 *   first by default — a correlated sum over the vendor's live purchases, D81). The payable and the
 *   purchase count of a page are one `GROUP BY` over the live purchases (S13).
 */
export class StockVendorsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: stock_vendors,
      entity: 'stockVendor',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      sortKeys: {
        payable: {
          keys: [{ value: () => STOCK_VENDOR_PAYABLE, sqlType: 'numeric' }],
          defaultOrder: 'desc',
        },
      },
      defaultSort: 'name',
      defaultOrder: 'asc',
    });
  }

  /** D81: the open dues of every vendor a list query matches, over every page (`meta.payable_total`). */
  async sumPayables(options: {
    organizationId: number;
    query: BaseRecordListQuery;
  }): Promise<number> {
    return this.sumOver({ ...options, column: STOCK_VENDOR_PAYABLE });
  }

  /**
   * S13, D81: each vendor's open dues and live purchase count, by vendor id (a vendor with no live
   * purchase is absent).
   */
  async findPurchaseFigures(
    vendorIds: readonly number[],
  ): Promise<Map<number, StockVendorPurchaseFigures>> {
    if (vendorIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        stock_vendor_id: stock_purchases.stock_vendor_id,
        payable: sql<string>`coalesce(sum(${stock_purchases.due_amount}) filter (where ${stock_purchases.due_amount} > 0), 0)`,
        purchase_count: sql<number>`count(*)::int`,
      })
      .from(stock_purchases)
      .where(
        and(
          inArray(stock_purchases.stock_vendor_id, [...vendorIds]),
          isNull(stock_purchases.deleted_at),
        ),
      )
      .groupBy(stock_purchases.stock_vendor_id);
    return new Map(
      rows.map((row) => [
        row.stock_vendor_id,
        { payable: Number(row.payable), purchase_count: Number(row.purchase_count) },
      ]),
    );
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
