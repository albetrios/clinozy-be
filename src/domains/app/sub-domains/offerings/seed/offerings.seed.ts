import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';

/** A row of `app.offerings` to seed: every column but the public id. */
export type SeedOfferingValues = Omit<typeof offerings.$inferInsert, 'public_id'>;

/** Inserts a service, package or product in the clinic's catalog (the database numbers it); returns its id. */
export async function seedOffering(values: SeedOfferingValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(offerings)
    .values({ public_id: generatePublicId('offering'), ...values })
    .returning({ id: offerings.id });
  return row!.id;
}
