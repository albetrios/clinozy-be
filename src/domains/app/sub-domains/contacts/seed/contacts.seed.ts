import { and, eq, isNull, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { contacts, contact_phones } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { contact_members } from '@/domains/app/sub-domains/contacts/contact-members/contact-members.schema.js';

/** A contact to seed: the person, their one (primary) number and, optionally, their household. */
export interface SeedContactPayload {
  organization_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  preference_tags?: readonly string[];
  /** The household's first contact; absent = their own household. */
  household_contact_id?: number;
  created_by_user_id?: number;
}

/**
 * Inserts a contact with its primary number unless a live one with the same name exists in the
 * organization (idempotent); returns its id either way. The database assigns the contact number,
 * the household (itself when none is given) and the search text.
 */
export async function seedContact(payload: SeedContactPayload): Promise<number> {
  const database = getRequestDatabase();
  const existing = await database
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.organization_id, payload.organization_id),
        sql`lower(${contacts.first_name}) = lower(${payload.first_name})`,
        sql`lower(coalesce(${contacts.last_name}, '')) = lower(${payload.last_name})`,
        isNull(contacts.deleted_at),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await database
    .insert(contacts)
    .values({
      public_id: generatePublicId('contact'),
      organization_id: payload.organization_id,
      first_name: payload.first_name,
      last_name: payload.last_name,
      primary_phone: payload.phone,
      preference_tags: [...(payload.preference_tags ?? [])],
      ...(payload.household_contact_id === undefined
        ? {}
        : { household_contact_id: payload.household_contact_id }),
      created_by_user_id: payload.created_by_user_id,
      updated_by_user_id: payload.created_by_user_id,
    })
    .returning({ id: contacts.id, household_contact_id: contacts.household_contact_id });
  await database.insert(contact_phones).values({
    contact_id: row!.id,
    household_contact_id: row!.household_contact_id,
    organization_id: payload.organization_id,
    phone: payload.phone,
    is_primary: true,
  });
  return row!.id;
}

/** Makes the user's live membership in the organization one of the contact's handlers (idempotent). */
export async function seedContactMember(options: {
  contact_id: number;
  organization_id: number;
  user_id: number;
}): Promise<void> {
  const [membership] = await getRequestDatabase()
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.user_id, options.user_id),
        eq(memberships.organization_id, options.organization_id),
        isNull(memberships.deleted_at),
      ),
    )
    .limit(1);
  if (!membership) return;
  await getRequestDatabase()
    .insert(contact_members)
    .values({
      contact_id: options.contact_id,
      membership_id: membership.id,
      organization_id: options.organization_id,
      created_by_user_id: options.user_id,
    })
    .onConflictDoNothing();
}
