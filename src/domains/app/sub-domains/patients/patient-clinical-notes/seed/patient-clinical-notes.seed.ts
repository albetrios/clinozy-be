import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { patient_clinical_notes } from '@/domains/app/sub-domains/patients/patient-clinical-notes/patient-clinical-notes.schema.js';

/** A row of `app.patient_clinical_notes` to seed: every column but the public id. */
export type SeedPatientClinicalNoteValues = Omit<
  typeof patient_clinical_notes.$inferInsert,
  'public_id'
>;

/** Inserts a clinical note (complaint, finding, diagnosis or suggestion) on a patient's file; returns its id. */
export async function seedPatientClinicalNote(
  values: SeedPatientClinicalNoteValues,
): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(patient_clinical_notes)
    .values({ public_id: generatePublicId('patientClinicalNote'), ...values })
    .returning({ id: patient_clinical_notes.id });
  return row!.id;
}
