import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';

/** A row of `app.patient_treatments` to seed: every column but the public id. */
export type SeedPatientTreatmentValues = Omit<typeof patient_treatments.$inferInsert, 'public_id'>;

/** Inserts a treatment session recorded on a patient's file; returns its id. */
export async function seedPatientTreatment(values: SeedPatientTreatmentValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(patient_treatments)
    .values({ public_id: generatePublicId('patientTreatment'), ...values })
    .returning({ id: patient_treatments.id });
  return row!.id;
}
