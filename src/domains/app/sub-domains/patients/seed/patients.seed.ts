import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';

/** A row of `app.patients` to seed: every column but the public id. */
export type SeedPatientValues = Omit<typeof patients.$inferInsert, 'public_id'>;

/** Inserts a patient for a contact (the database numbers them); returns their id. */
export async function seedPatient(values: SeedPatientValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(patients)
    .values({ public_id: generatePublicId('patient'), ...values })
    .returning({ id: patients.id });
  return row!.id;
}
