import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  medical_rep_manufacturers,
  medical_reps,
} from '@/domains/app/sub-domains/medical/medical-reps/medical-reps.schema.js';

/** A row of `app.medical_reps` to seed: every column but the public id. */
export type SeedMedicalRepValues = Omit<typeof medical_reps.$inferInsert, 'public_id'>;

/** Inserts a medical representative and the visit they are due for next; returns their id. */
export async function seedMedicalRep(values: SeedMedicalRepValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(medical_reps)
    .values({ public_id: generatePublicId('medicalRep'), ...values })
    .returning({ id: medical_reps.id });
  return row!.id;
}

/** A row of `app.medical_rep_manufacturers` to seed: a brand an MR represents. */
export type SeedMedicalRepManufacturerValues = typeof medical_rep_manufacturers.$inferInsert;

/** Links an MR to a brand they represent. */
export async function seedMedicalRepManufacturer(
  values: SeedMedicalRepManufacturerValues,
): Promise<void> {
  await getRequestDatabase().insert(medical_rep_manufacturers).values(values);
}
