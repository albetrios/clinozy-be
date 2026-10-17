import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  medicine_batches,
  medicine_supplier_prices,
  medicines,
} from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';

/** A row of `app.medicines` to seed: every column but the public id (the database numbers it). */
export type SeedMedicineValues = Omit<typeof medicines.$inferInsert, 'public_id'>;

/**
 * Inserts a medicine the store sells; returns its id. Its `quantity` is its batches' sum (MD4) —
 * the caller sends the total of the batches it seeds.
 */
export async function seedMedicine(values: SeedMedicineValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(medicines)
    .values({ public_id: generatePublicId('medicine'), ...values })
    .returning({ id: medicines.id });
  return row!.id;
}

/** A row of `app.medicine_batches` to seed: every column but the public id. */
export type SeedMedicineBatchValues = Omit<typeof medicine_batches.$inferInsert, 'public_id'>;

/** Inserts one batch of a medicine with what is left of it; returns its id. */
export async function seedMedicineBatch(values: SeedMedicineBatchValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(medicine_batches)
    .values({ public_id: generatePublicId('medicineBatch'), ...values })
    .returning({ id: medicine_batches.id });
  return row!.id;
}

/** A row of `app.medicine_supplier_prices` to seed: what an agency charges for a medicine. */
export type SeedMedicineSupplierPriceValues = typeof medicine_supplier_prices.$inferInsert;

/** Records an agency's rate for a medicine (the lowest is its best rate). */
export async function seedMedicineSupplierPrice(
  values: SeedMedicineSupplierPriceValues,
): Promise<void> {
  await getRequestDatabase().insert(medicine_supplier_prices).values(values);
}
