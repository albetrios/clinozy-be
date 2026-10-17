import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { stock_item_movements } from '@/domains/app/sub-domains/stock/stock-item-movements/stock-item-movements.schema.js';

/** A row of `app.stock_item_movements` to seed: every column but the public id. */
export type SeedStockItemMovementValues = Omit<
  typeof stock_item_movements.$inferInsert,
  'public_id'
>;

/**
 * Inserts one movement with the balance it left (append-only, S5); returns its id. Seeding an
 * item's movements in time order, each `quantity_after` the one before plus its change, is the
 * caller's job.
 */
export async function seedStockItemMovement(values: SeedStockItemMovementValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(stock_item_movements)
    .values({ public_id: generatePublicId('stockItemMovement'), ...values })
    .returning({ id: stock_item_movements.id });
  return row!.id;
}
