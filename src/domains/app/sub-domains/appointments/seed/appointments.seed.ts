import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';

/** A row of `app.appointments` to seed: every column but the public id. */
export type SeedAppointmentValues = Omit<typeof appointments.$inferInsert, 'public_id'>;

/** Inserts an appointment (the database numbers it and derives its time range); returns its id. */
export async function seedAppointment(values: SeedAppointmentValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(appointments)
    .values({ public_id: generatePublicId('appointment'), ...values })
    .returning({ id: appointments.id });
  return row!.id;
}
