import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { patient_reviews } from '@/domains/app/sub-domains/patients/patient-reviews/patient-reviews.schema.js';

/** A row of `app.patient_reviews` to seed: every column but the public id. */
export type SeedPatientReviewValues = Omit<typeof patient_reviews.$inferInsert, 'public_id'>;

/** Inserts a review the patient left (Google, WhatsApp, the clinic's form); returns its id. */
export async function seedPatientReview(values: SeedPatientReviewValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(patient_reviews)
    .values({ public_id: generatePublicId('patientReview'), ...values })
    .returning({ id: patient_reviews.id });
  return row!.id;
}
