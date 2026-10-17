import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  supplier_manufacturers,
  suppliers,
} from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';

/** A row of `app.suppliers` to seed: every column but the public id. */
export type SeedSupplierValues = Omit<typeof suppliers.$inferInsert, 'public_id'>;

/** Inserts an agency the medical store buys from; returns its id. */
export async function seedSupplier(values: SeedSupplierValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(suppliers)
    .values({ public_id: generatePublicId('supplier'), ...values })
    .returning({ id: suppliers.id });
  return row!.id;
}

/** A row of `app.supplier_manufacturers` to seed: which brand an agency distributes. */
export type SeedSupplierManufacturerValues = typeof supplier_manufacturers.$inferInsert;

/** Links an agency to a brand it distributes. */
export async function seedSupplierManufacturer(
  values: SeedSupplierManufacturerValues,
): Promise<void> {
  await getRequestDatabase().insert(supplier_manufacturers).values(values);
}
