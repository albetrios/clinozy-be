import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  stock_purchase_items,
  stock_purchases,
} from '@/domains/app/sub-domains/stock/stock-purchases/stock-purchases.schema.js';

/** A vendor bill to seed: every column of `app.stock_purchases` but the public id, and its lines. */
export type SeedStockPurchasePayload = Omit<typeof stock_purchases.$inferInsert, 'public_id'> & {
  lines: readonly Omit<
    typeof stock_purchase_items.$inferInsert,
    'stock_purchase_id' | 'line_number' | 'organization_id'
  >[];
};

/**
 * Inserts a vendor bill (the database numbers it) with its lines, numbered in order; returns its
 * id. `bill_amount` is its lines' amounts and `paid_amount` its supplier bills' — the caller sends
 * them as they reconcile; each line's `received` movement is the movements seed's.
 */
export async function seedStockPurchase(payload: SeedStockPurchasePayload): Promise<number> {
  const { lines, ...values } = payload;
  const database = getRequestDatabase();
  const [row] = await database
    .insert(stock_purchases)
    .values({ public_id: generatePublicId('stockPurchase'), ...values })
    .returning({ id: stock_purchases.id });
  await database.insert(stock_purchase_items).values(
    lines.map((line, index) => ({
      ...line,
      stock_purchase_id: row!.id,
      line_number: index + 1,
      organization_id: values.organization_id,
    })),
  );
  return row!.id;
}
