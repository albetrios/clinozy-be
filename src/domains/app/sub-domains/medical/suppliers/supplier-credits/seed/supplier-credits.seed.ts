import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { supplier_credits } from '@/domains/app/sub-domains/medical/suppliers/supplier-credits/supplier-credits.schema.js';

/** A row of `app.supplier_credits` to seed: every column but the public id. */
export type SeedSupplierCreditValues = Omit<typeof supplier_credits.$inferInsert, 'public_id'>;

/**
 * Inserts packs sent back to an agency and owed back (`amount` = quantity × rate); returns its id.
 * Taking the packs out of their batch and setting `applied_amount` against the agency's orders is
 * the caller's job.
 */
export async function seedSupplierCredit(values: SeedSupplierCreditValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(supplier_credits)
    .values({ public_id: generatePublicId('supplierCredit'), ...values })
    .returning({ id: supplier_credits.id });
  return row!.id;
}
