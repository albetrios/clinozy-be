import { eq, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { contact_activities } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.schema.js';

/** A row of `app.contact_activities` to seed: every column but the public id. */
export type SeedContactActivityValues = Omit<typeof contact_activities.$inferInsert, 'public_id'>;

/**
 * Inserts one entry in a contact's conversation — a WhatsApp message, call log or note — and moves
 * the contact's activity times the way the service does (`recordActivity`: last activity, and the
 * last sent or received time for a message, never back); returns the entry's id.
 */
export async function seedContactActivity(values: SeedContactActivityValues): Promise<number> {
  const database = getRequestDatabase();
  const [row] = await database
    .insert(contact_activities)
    .values({ public_id: generatePublicId('contactActivity'), ...values })
    .returning({ id: contact_activities.id });
  const at = sql`${(values.occurred_at ?? new Date()).toISOString()}::timestamptz`;
  const latest = (column: AnyPgColumn) =>
    sql`greatest(coalesce(${column}, '-infinity'::timestamptz), ${at})`;
  await database
    .update(contacts)
    .set({
      last_activity_at: latest(contacts.last_activity_at),
      ...(values.direction === 'sent' ? { last_sent_at: latest(contacts.last_sent_at) } : {}),
      ...(values.direction === 'received'
        ? { last_received_at: latest(contacts.last_received_at) }
        : {}),
    })
    .where(eq(contacts.id, values.contact_id));
  return row!.id;
}
