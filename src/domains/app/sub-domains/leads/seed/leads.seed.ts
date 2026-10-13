import { and, eq, isNull, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { MILLISECONDS_PER_DAY } from '@/shared/constants/ttl.constants.js';

/** The default `lead_hold_days` (D40) — how long a seeded owner holds their lead. */
const HOLD_DAYS = 3;

/** A lead to seed for a contact named by first and last name. */
export interface SeedLeadPayload {
  organization_id: number;
  first_name: string;
  last_name: string;
  status: string;
  source: string;
  interests: readonly string[];
  /** The user whose membership owns it (and holds it for three days); absent = open to the team. */
  owner_user_id?: number;
  created_by_user_id?: number;
  /** The rest of a real-looking lead: its branch, follow-up, notes and when it came in. */
  details?: Partial<
    Pick<typeof leads.$inferInsert, 'branch_id' | 'follow_up_at' | 'notes' | 'created_at'>
  >;
}

/**
 * Inserts a lead for the named live contact unless the contact already has one (idempotent); a
 * missing contact is skipped. The database assigns the lead number. Returns the lead's id (the
 * existing one on a re-run), or `null` when the contact is missing.
 */
export async function seedLead(payload: SeedLeadPayload): Promise<number | null> {
  const database = getRequestDatabase();
  const [contact] = await database
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
  if (!contact) return null;
  const [existing] = await database
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.contact_id, contact.id))
    .limit(1);
  if (existing) return existing.id;
  const [owner] =
    payload.owner_user_id === undefined
      ? []
      : await database
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.user_id, payload.owner_user_id),
              eq(memberships.organization_id, payload.organization_id),
              isNull(memberships.deleted_at),
            ),
          )
          .limit(1);
  const [row] = await database
    .insert(leads)
    .values({
      public_id: generatePublicId('lead'),
      organization_id: payload.organization_id,
      contact_id: contact.id,
      status: payload.status,
      source: payload.source,
      interests: [...payload.interests],
      ...(owner
        ? {
            owner_membership_id: owner.id,
            held_until: new Date(Date.now() + HOLD_DAYS * MILLISECONDS_PER_DAY),
          }
        : {}),
      created_by_user_id: payload.created_by_user_id,
      updated_by_user_id: payload.created_by_user_id,
      ...payload.details,
      ...(payload.details?.created_at ? { updated_at: payload.details.created_at } : {}),
    })
    .returning({ id: leads.id });
  return row!.id;
}
