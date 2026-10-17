import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { manufacturers } from '@/domains/app/sub-domains/medical/manufacturers/manufacturers.schema.js';

/** A row of `app.manufacturers` to seed: every column but the public id (the name upper case). */
export type SeedManufacturerValues = Omit<typeof manufacturers.$inferInsert, 'public_id'>;

/** Inserts a brand on the medical store's packs; returns its id. */
export async function seedManufacturer(values: SeedManufacturerValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(manufacturers)
    .values({ public_id: generatePublicId('manufacturer'), ...values })
    .returning({ id: manufacturers.id });
  return row!.id;
}
