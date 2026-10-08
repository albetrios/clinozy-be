import { and, asc, eq, isNull } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import type { BaseRecordLinkTable } from '@/domains/app/base-record.repository.js';
import { contact_members } from './contact-members.schema.js';

/** The `member_membership_ids` link of a contact (`app.contact_members`, CT11). */
export const CONTACT_MEMBERS_LINK: BaseRecordLinkTable = {
  table: contact_members,
  ownerColumn: 'contact_id',
  targetColumn: 'membership_id',
  targetTable: memberships,
};

/**
 * Persistence for `app.contact_members` — the team members who handle a person (launch ROUTE
 * #129, routes-final 4.B). Runs on the request's database handle, so RLS scopes every statement to
 * the active organization; the writes go through the shared link helper (`replaceLinkedIds`).
 */
export class ContactMembersRepository {
  /** The live memberships handling a contact, oldest first (`mem_…` and when they were added). */
  async listForContact(
    contactId: number,
  ): Promise<{ membership_public_id: string; created_at: Date }[]> {
    return getRequestDatabase()
      .select({
        membership_public_id: memberships.public_id,
        created_at: contact_members.created_at,
      })
      .from(contact_members)
      .innerJoin(memberships, eq(memberships.id, contact_members.membership_id))
      .where(and(eq(contact_members.contact_id, contactId), isNull(memberships.deleted_at)))
      .orderBy(asc(contact_members.created_at), asc(memberships.public_id));
  }

  /**
   * Removes an ended membership from every contact it handled (launch K4 — "who handles the person
   * now" is cleared when they leave); a restore starts them with none.
   */
  async deleteForMembership(options: {
    organization_id: number;
    membership_id: number;
  }): Promise<void> {
    await getRequestDatabase()
      .delete(contact_members)
      .where(
        and(
          eq(contact_members.organization_id, options.organization_id),
          eq(contact_members.membership_id, options.membership_id),
        ),
      );
  }
}
