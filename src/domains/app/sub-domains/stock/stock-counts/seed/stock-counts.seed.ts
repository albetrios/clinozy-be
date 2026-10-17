import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  stock_count_lines,
  stock_counts,
} from '@/domains/app/sub-domains/stock/stock-counts/stock-counts.schema.js';

/** A stock check to seed: every column of `app.stock_counts` but the public id, and its lines. */
export type SeedStockCountPayload = Omit<typeof stock_counts.$inferInsert, 'public_id'> & {
  lines: readonly Omit<
    typeof stock_count_lines.$inferInsert,
    'stock_count_id' | 'organization_id'
  >[];
};

/**
 * Inserts a stock check with what it counted for each item (S9); returns its id. Each difference's
 * `adjust` movement is the movements seed's.
 */
export async function seedStockCount(payload: SeedStockCountPayload): Promise<number> {
  const { lines, ...values } = payload;
  const database = getRequestDatabase();
  const [row] = await database
    .insert(stock_counts)
    .values({ public_id: generatePublicId('stockCount'), ...values })
    .returning({ id: stock_counts.id });
  await database.insert(stock_count_lines).values(
    lines.map((line) => ({
      ...line,
      stock_count_id: row!.id,
      organization_id: values.organization_id,
    })),
  );
  return row!.id;
}
