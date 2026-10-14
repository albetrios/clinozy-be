import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';

/** A row of `app.patient_check_ins` to seed: every column but the public id. */
export type SeedPatientCheckInValues = Omit<typeof patient_check_ins.$inferInsert, 'public_id'>;

/** Inserts a progress check-in (how the patient feels after treatment) on their file; returns its id. */
export async function seedPatientCheckIn(values: SeedPatientCheckInValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(patient_check_ins)
    .values({ public_id: generatePublicId('patientCheckIn'), ...values })
    .returning({ id: patient_check_ins.id });
  return row!.id;
}
