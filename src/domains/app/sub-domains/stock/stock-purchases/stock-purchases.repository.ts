import { and, asc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { payments } from '@/domains/app/sub-domains/billing/payments/payments.schema.js';
import { stock_items } from '@/domains/app/sub-domains/stock/stock-items/stock-items.schema.js';
import { stock_vendors } from '@/domains/app/sub-domains/stock/stock-vendors/stock-vendors.schema.js';
import { buildContainsLikePattern } from '@/shared/utils/http/list-query.util.js';
import { stock_purchase_items, stock_purchases } from './stock-purchases.schema.js';

/** One line of a purchase as a purchase reads it — the item's public id joined in (S10). */
export interface StockPurchaseItemRow {
  stock_purchase_id: number;
  line_number: number;
  stock_item_id: string;
  quantity: string;
  rate: string;
  amount: string;
}

/** `q` over the bill number, the vendor's name and the number (`#16`). */
function searchCondition(value: unknown): SQL {
  const q = String(value);
  const pattern = buildContainsLikePattern(q);
  const vendorNamed = sql`exists (select 1 from ${stock_vendors} where ${stock_vendors.id} = ${stock_purchases.stock_vendor_id} and ${stock_vendors.name} ilike ${pattern})`;
  const digits = /^\s*#?0*(\d{1,9})\s*$/.exec(q)?.[1];
  return or(
    sql`${stock_purchases.bill_number} ilike ${pattern}`,
    vendorNamed,
    digits === undefined ? undefined : eq(stock_purchases.stock_purchase_number, Number(digits)),
  ) as SQL;
}

/**
 * Persistence for `app.stock_purchases` and its lines (launch ROUTE #137, routes-final 9.D) — the
 * shared reads and writes, plus the lines, the paid amount's lock and the payments that point at
 * a purchase.
 *
 * @remarks
 * - **Algorithm:** `q` is the bill number, the vendor's name or the number (`#16`) — a derived
 *   filter, the vendor being another table; sorts `purchase_date` (default, newest first),
 *   `stock_purchase_number`, `bill_amount`, `due_amount`, `created_at`.
 */
export class StockPurchasesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: stock_purchases,
      entity: 'stockPurchase',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      sortKeys: {
        purchase_date: { keys: [{ value: 'purchase_date' }], defaultOrder: 'desc' },
        stock_purchase_number: { keys: [{ value: 'stock_purchase_number' }], defaultOrder: 'desc' },
        bill_amount: { keys: [{ value: 'bill_amount' }], defaultOrder: 'desc' },
        due_amount: { keys: [{ value: 'due_amount' }], defaultOrder: 'desc' },
      },
      derivedFilters: { search: searchCondition },
      defaultSort: 'purchase_date',
      defaultOrder: 'desc',
    });
  }

  /** S10: writes a purchase's lines. */
  async insertItems(
    rows: readonly {
      stock_purchase_id: number;
      line_number: number;
      stock_item_id: number;
      organization_id: number;
      quantity: string;
      rate: string;
      amount: string;
    }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await getRequestDatabase()
      .insert(stock_purchase_items)
      .values([...rows]);
  }

  /** S10: the lines of a page of purchases, in line order. */
  async findItems(purchaseIds: readonly number[]): Promise<StockPurchaseItemRow[]> {
    if (purchaseIds.length === 0) return [];
    return getRequestDatabase()
      .select({
        stock_purchase_id: stock_purchase_items.stock_purchase_id,
        line_number: stock_purchase_items.line_number,
        stock_item_id: stock_items.public_id,
        quantity: stock_purchase_items.quantity,
        rate: stock_purchase_items.rate,
        amount: stock_purchase_items.amount,
      })
      .from(stock_purchase_items)
      .innerJoin(stock_items, eq(stock_items.id, stock_purchase_items.stock_item_id))
      .where(inArray(stock_purchase_items.stock_purchase_id, [...purchaseIds]))
      .orderBy(asc(stock_purchase_items.stock_purchase_id), asc(stock_purchase_items.line_number));
  }

  /** S12: a purchase's lines as its restore receives them again — the items' ids. */
  async findItemQuantities(
    purchaseId: number,
  ): Promise<{ stock_item_id: number; quantity: string }[]> {
    return getRequestDatabase()
      .select({
        stock_item_id: stock_purchase_items.stock_item_id,
        quantity: stock_purchase_items.quantity,
      })
      .from(stock_purchase_items)
      .where(eq(stock_purchase_items.stock_purchase_id, purchaseId))
      .orderBy(asc(stock_purchase_items.line_number));
  }

  /** S11: a live purchase's paid amount, its row taken `FOR UPDATE` (null when gone). */
  async lockPaidAmount(id: number): Promise<string | null> {
    const rows = await getRequestDatabase()
      .select({ paid_amount: stock_purchases.paid_amount })
      .from(stock_purchases)
      .where(and(eq(stock_purchases.id, id), isNull(stock_purchases.deleted_at)))
      .for('update');
    return rows[0]?.paid_amount ?? null;
  }

  /** S11: the live payments that point at each purchase, oldest first (public ids). */
  async findPaymentIds(purchaseIds: readonly number[]): Promise<Map<number, string[]>> {
    if (purchaseIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ stock_purchase_id: payments.stock_purchase_id, public_id: payments.public_id })
      .from(payments)
      .where(
        and(inArray(payments.stock_purchase_id, [...purchaseIds]), isNull(payments.deleted_at)),
      )
      .orderBy(asc(payments.paid_at), asc(payments.id));
    const byPurchase = new Map<number, string[]>();
    for (const row of rows) {
      if (row.stock_purchase_id === null) continue;
      byPurchase.set(row.stock_purchase_id, [
        ...(byPurchase.get(row.stock_purchase_id) ?? []),
        row.public_id,
      ]);
    }
    return byPurchase;
  }

  /** A live item of the organization with this name, in any case (a quick item that exists). */
  async findLiveItemIdByName(options: {
    organizationId: number;
    name: string;
  }): Promise<number | null> {
    const rows = await getRequestDatabase()
      .select({ id: stock_items.id })
      .from(stock_items)
      .where(
        and(
          eq(stock_items.organization_id, options.organizationId),
          isNull(stock_items.deleted_at),
          sql`lower(${stock_items.name}) = lower(${options.name})`,
        ),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }
}
