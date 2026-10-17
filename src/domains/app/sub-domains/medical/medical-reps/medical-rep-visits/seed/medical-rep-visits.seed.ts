import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { medical_rep_visits } from '@/domains/app/sub-domains/medical/medical-reps/medical-rep-visits/medical-rep-visits.schema.js';

/** A row of `app.medical_rep_visits` to seed: every column but the public id. */
export type SeedMedicalRepVisitValues = Omit<typeof medical_rep_visits.$inferInsert, 'public_id'>;

/** Inserts one logged MR visit (`next_visit_on` after it); returns its id. */
export async function seedMedicalRepVisit(values: SeedMedicalRepVisitValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(medical_rep_visits)
    .values({ public_id: generatePublicId('medicalRepVisit'), ...values })
    .returning({ id: medical_rep_visits.id });
  return row!.id;
}
