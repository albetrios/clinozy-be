import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { stock_items } from '@/domains/app/sub-domains/stock/stock-items/stock-items.schema.js';

/** A row of `app.stock_items` to seed: every column but the public id (the database numbers it). */
export type SeedStockItemValues = Omit<typeof stock_items.$inferInsert, 'public_id'>;

/**
 * Inserts a consumable or piece of equipment; returns its id. Its `quantity` is the balance its
 * movements leave (S5) — the caller sends the last one's `quantity_after`.
 */
export async function seedStockItem(values: SeedStockItemValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(stock_items)
    .values({ public_id: generatePublicId('stockItem'), ...values })
    .returning({ id: stock_items.id });
  return row!.id;
}
