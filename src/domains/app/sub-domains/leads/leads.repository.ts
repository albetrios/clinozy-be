import { and, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
  nullsLastSortKeys,
} from '@/domains/app/base-record.repository.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { buildContainsLikePattern } from '@/shared/utils/http/list-query.util.js';
import { LEAD_OPEN_STATUS_VALUES, LEAD_OWNERSHIP } from './leads.constants.js';
import { leads, lead_involved_memberships } from './leads.schema.js';
import type { LeadContactSummary, LeadSearch } from './leads.types.js';

/** The `involved_membership_ids` link of a lead (`app.lead_involved_memberships`, L2). */
export const LEAD_INVOLVED_MEMBERSHIPS_LINK: BaseRecordLinkTable = {
  table: lead_involved_memberships,
  ownerColumn: 'lead_id',
  targetColumn: 'membership_id',
  targetTable: memberships,
};

/** A lead's status is one of the open ones (L6). */
const isOpenStatus = sql`${leads.status} in (${sql.join(
  LEAD_OPEN_STATUS_VALUES.map((status) => sql`${status}`),
  sql`, `,
)})`;

/** One column of the lead's contact (a correlated read of its primary key). */
function contactColumn(column: SQL): SQL {
  return sql`(select ${column} from ${contacts} where ${contacts.id} = ${leads.contact_id})`;
}

/** The internal id of a membership of the organization by public id (none = no row matches). */
function membershipIdOf(publicId: string, organizationId: number): SQL {
  return sql`(select ${memberships.id} from ${memberships} where ${memberships.public_id} = ${publicId} and ${memberships.organization_id} = ${organizationId})`;
}

/** The contacts of the organization a search matches — `IN` over their trigram-indexed search text (L7). */
function contactsMatching(search: LeadSearch, organizationId: number): SQL[] {
  const conditions: SQL[] = [];
  if (search.text !== undefined) {
    conditions.push(
      sql`${leads.contact_id} in (select ${contacts.id} from ${contacts} where ${contacts.organization_id} = ${organizationId} and ${contacts.search_text} ilike ${buildContainsLikePattern(search.text)})`,
    );
  }
  if (search.contactNumber !== undefined) {
    conditions.push(
      sql`${leads.contact_id} in (select ${contacts.id} from ${contacts} where ${contacts.organization_id} = ${organizationId} and ${contacts.contact_number} = ${search.contactNumber})`,
    );
  }
  if (search.leadNumber !== undefined) conditions.push(eq(leads.lead_number, search.leadNumber));
  return conditions;
}

/**
 * Persistence for `app.leads` (launch ROUTE #131, routes-final 5) — the shared app record reads and
 * writes on its table, plus what a lead reads of its contact and patient file.
 *
 * @remarks
 * - **Algorithm:** `q` reaches the contact (L7): its trigram-indexed search text (names, email,
 *   Instagram, every number, `c-<number>`) or contact number, and the lead number (`#2371`) — the
 *   validator reads which. Sorts: `created_at` (newest first), `name` (the contact's first, then
 *   last name), `status` (then newest first), and `source`, `follow_up_at`, `last_activity_at` (the
 *   contact's) — on a value that can be empty, those rows come last in either order
 *   ({@link nullsLastSortKeys}). Derived filters: `search`, `interests` (`&&`, the GIN index),
 *   `team_membership_id` (owner or involved), `is_awaiting_reply` (the contact's), `ownership`
 *   (`open` · `held` · `releasing_today` — the hold ends before the organization's tomorrow).
 * - **Failure modes:** a unique violation propagates (the service maps it — `lead_open_exists`).
 */
export class LeadsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: leads,
      entity: 'lead',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      sortKeys: {
        created_at: { keys: [{ value: 'created_at' }], defaultOrder: 'desc' },
        name: {
          keys: [
            { value: () => contactColumn(sql`${contacts.first_name}`), sqlType: 'text' },
            {
              value: () => contactColumn(sql`coalesce(${contacts.last_name}, '')`),
              sqlType: 'text',
            },
          ],
          defaultOrder: 'asc',
        },
        status: {
          keys: [{ value: 'status' }, { value: 'created_at', reversed: true }],
          defaultOrder: 'asc',
        },
        source: {
          keys: nullsLastSortKeys({
            value: () => sql`${leads.source}`,
            sqlType: 'text',
            empty: sql`''`,
            defaultOrder: 'asc',
          }),
          defaultOrder: 'asc',
        },
        follow_up_at: {
          keys: nullsLastSortKeys({
            value: () => sql`${leads.follow_up_at}`,
            sqlType: 'timestamptz',
            empty: sql`'-infinity'::timestamptz`,
            defaultOrder: 'asc',
          }),
          defaultOrder: 'asc',
        },
        last_activity_at: {
          keys: nullsLastSortKeys({
            value: () => contactColumn(sql`${contacts.last_activity_at}`),
            sqlType: 'timestamptz',
            empty: sql`'-infinity'::timestamptz`,
            defaultOrder: 'desc',
          }),
          defaultOrder: 'desc',
        },
      },
      derivedFilters: {
        search: (value, organizationId) => {
          const conditions = contactsMatching(value as LeadSearch, organizationId);
          return conditions.length === 0 ? sql`false` : sql`(${sql.join(conditions, sql` or `)})`;
        },
        interests: (value) =>
          sql`${leads.interests} && array[${sql.join(
            (value as string[]).map((interest) => sql`${interest}`),
            sql`, `,
          )}]::text[]`,
        team_membership_id: (value, organizationId) => {
          const membershipId = membershipIdOf(String(value), organizationId);
          return sql`(${leads.owner_membership_id} = ${membershipId} or exists (select 1 from ${lead_involved_memberships} where ${lead_involved_memberships.lead_id} = ${leads.id} and ${lead_involved_memberships.membership_id} = ${membershipId}))`;
        },
        is_awaiting_reply: (value) => {
          const awaiting = sql`exists (select 1 from ${contacts} where ${contacts.id} = ${leads.contact_id} and ${contacts.last_received_at} is not null and (${contacts.last_sent_at} is null or ${contacts.last_received_at} > ${contacts.last_sent_at}))`;
          return value === true ? awaiting : sql`not ${awaiting}`;
        },
        ownership: (value, organizationId) => {
          const held = sql`(${leads.held_until} is not null and ${leads.held_until} > now())`;
          if (value === LEAD_OWNERSHIP.OPEN) return sql`not ${held}`;
          if (value === LEAD_OWNERSHIP.HELD) return held;
          const timezone = sql`(select ${organizations.timezone} from ${organizations} where ${organizations.id} = ${organizationId})`;
          const tomorrow = sql`((date_trunc('day', now() at time zone ${timezone}) + interval '1 day') at time zone ${timezone})`;
          return sql`(${held} and ${leads.held_until} < ${tomorrow})`;
        },
      },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }

  /** The contact's live open lead other than `exceptLeadId` (L6) — its public id and number, or null. */
  async findOpenLeadOfContact(options: {
    contactId: number;
    exceptLeadId?: number | undefined;
  }): Promise<{ id: number; public_id: string; lead_number: number } | null> {
    const rows = await getRequestDatabase()
      .select({ id: leads.id, public_id: leads.public_id, lead_number: leads.lead_number })
      .from(leads)
      .where(
        and(
          eq(leads.contact_id, options.contactId),
          isNull(leads.deleted_at),
          isOpenStatus,
          options.exceptLeadId === undefined ? undefined : ne(leads.id, options.exceptLeadId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** The summary every lead carries of its contact (L1), by the contacts' public ids. */
  async findContactSummaries(publicIds: readonly string[]): Promise<LeadContactSummary[]> {
    if (publicIds.length === 0) return [];
    return getRequestDatabase()
      .select({
        id: contacts.public_id,
        contact_number: contacts.contact_number,
        first_name: contacts.first_name,
        last_name: contacts.last_name,
        primary_phone: contacts.primary_phone,
        default_channel: contacts.default_channel,
        last_activity_at: contacts.last_activity_at,
        last_sent_at: contacts.last_sent_at,
        last_received_at: contacts.last_received_at,
      })
      .from(contacts)
      .where(inArray(contacts.public_id, [...publicIds]));
  }

  /**
   * The live patient file each lead opened, by the leads' public ids (`patients.lead_id` — the
   * contact's own file once patient files point at contacts, #133).
   */
  async findPatientPublicIds(leadPublicIds: readonly string[]): Promise<Map<string, string>> {
    if (leadPublicIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ lead_public_id: leads.public_id, patient_public_id: patients.public_id })
      .from(patients)
      .innerJoin(leads, eq(leads.id, patients.lead_id))
      .where(and(inArray(leads.public_id, [...leadPublicIds]), isNull(patients.deleted_at)));
    return new Map(rows.map((row) => [row.lead_public_id, row.patient_public_id]));
  }

  /**
   * The live open lead of each contact (L6 — at most one), by the contacts' public ids — a
   * contact's `open_lead_id` / `open_lead_status` and its preview's `open_lead`.
   */
  async findOpenLeadsOfContacts(
    contactPublicIds: readonly string[],
  ): Promise<Map<string, { id: string; status: string; owner_membership_id: string | null }>> {
    if (contactPublicIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        contact_public_id: contacts.public_id,
        id: leads.public_id,
        status: leads.status,
        owner_membership_id: memberships.public_id,
      })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contact_id))
      .leftJoin(memberships, eq(memberships.id, leads.owner_membership_id))
      .where(
        and(
          inArray(contacts.public_id, [...contactPublicIds]),
          isNull(leads.deleted_at),
          isOpenStatus,
        ),
      );
    return new Map(rows.map(({ contact_public_id, ...lead }) => [contact_public_id, lead]));
  }

  /** Whether any live lead points at the contact (CT7 — the contact cannot be removed). */
  async hasLiveLeadForContact(contactId: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.contact_id, contactId), isNull(leads.deleted_at)))
      .limit(1);
    return rows.length > 0;
  }

  /** Adds members to a lead's involved set (a member already in it stays once). */
  async addInvolvedMemberships(options: {
    organizationId: number;
    leadId: number;
    membershipIds: readonly number[];
    userId: number | null;
  }): Promise<void> {
    if (options.membershipIds.length === 0) return;
    await getRequestDatabase()
      .insert(lead_involved_memberships)
      .values(
        options.membershipIds.map((membershipId) => ({
          lead_id: options.leadId,
          membership_id: membershipId,
          organization_id: options.organizationId,
          created_by_user_id: options.userId,
        })),
      )
      .onConflictDoNothing();
  }

  /** The internal membership ids involved in a lead. */
  async listInvolvedMembershipIds(leadId: number): Promise<number[]> {
    const rows = await getRequestDatabase()
      .select({ membership_id: lead_involved_memberships.membership_id })
      .from(lead_involved_memberships)
      .where(eq(lead_involved_memberships.lead_id, leadId));
    return rows.map((row) => row.membership_id);
  }

  /** Removes one member from a lead's involved set (the new owner is not also involved). */
  async removeInvolvedMembership(options: { leadId: number; membershipId: number }): Promise<void> {
    await getRequestDatabase()
      .delete(lead_involved_memberships)
      .where(
        and(
          eq(lead_involved_memberships.lead_id, options.leadId),
          eq(lead_involved_memberships.membership_id, options.membershipId),
        ),
      );
  }

  /**
   * The leave step's lead part (K4): every lead an ended membership owns returns to the pool — no
   * owner, no hold — and the member stays on it as involved (they worked it, L9).
   */
  async releaseForMembership(options: {
    organization_id: number;
    membership_id: number;
  }): Promise<void> {
    const owned = await getRequestDatabase()
      .update(leads)
      .set({ owner_membership_id: null, held_until: null })
      .where(
        and(
          eq(leads.organization_id, options.organization_id),
          eq(leads.owner_membership_id, options.membership_id),
        ),
      )
      .returning({ id: leads.id });
    if (owned.length === 0) return;
    await getRequestDatabase()
      .insert(lead_involved_memberships)
      .values(
        owned.map(({ id }) => ({
          lead_id: id,
          membership_id: options.membership_id,
          organization_id: options.organization_id,
        })),
      )
      .onConflictDoNothing();
  }

  /**
   * The automatic move of a sent line (4, 5.10): the contact's open lead goes from `new` to
   * `contacted` — any other status stays.
   */
  async markContacted(contactId: number): Promise<void> {
    await getRequestDatabase()
      .update(leads)
      .set({ status: 'contacted', updated_at: sql`greatest(now(), ${leads.created_at})` })
      .where(
        and(eq(leads.contact_id, contactId), eq(leads.status, 'new'), isNull(leads.deleted_at)),
      );
  }

  /** The first interest of the contact's open lead — a message's `<interest>` (M9) — or null. */
  async findOpenLeadInterest(contactId: number): Promise<string | null> {
    const rows = await getRequestDatabase()
      .select({ interest: sql<string | null>`${leads.interests}[1]` })
      .from(leads)
      .where(and(eq(leads.contact_id, contactId), isNull(leads.deleted_at), isOpenStatus))
      .limit(1);
    return rows[0]?.interest ?? null;
  }
}
