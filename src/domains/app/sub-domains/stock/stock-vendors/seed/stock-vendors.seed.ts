import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { stock_vendors } from '@/domains/app/sub-domains/stock/stock-vendors/stock-vendors.schema.js';

/** A row of `app.stock_vendors` to seed: every column but the public id. */
export type SeedStockVendorValues = Omit<typeof stock_vendors.$inferInsert, 'public_id'>;

/** Inserts a vendor of the clinic's consumables (never a store agency, S13); returns its id. */
export async function seedStockVendor(values: SeedStockVendorValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(stock_vendors)
    .values({ public_id: generatePublicId('stockVendor'), ...values })
    .returning({ id: stock_vendors.id });
  return row!.id;
}
