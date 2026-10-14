import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { payments } from '@/domains/app/sub-domains/billing/payments/payments.schema.js';

/** A row of `app.payments` to seed: every column but the public id. */
export type SeedPaymentValues = Omit<typeof payments.$inferInsert, 'public_id'>;

/** Inserts a payment (the database numbers it); returns its id. Keeping the invoice's paid amount equal to its payments is the caller's job. */
export async function seedPayment(values: SeedPaymentValues): Promise<number> {
  const [row] = await getRequestDatabase()
    .insert(payments)
    .values({ public_id: generatePublicId('payment'), ...values })
    .returning({ id: payments.id });
  return row!.id;
}
