import { and, count, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  BaseRecordRepository,
  type BaseRecordChildTable,
  type BaseRecordListQuery,
} from '@/domains/app/base-record.repository.js';
import { buildContainsLikePattern, escapeLikeTerm } from '@/shared/utils/http/list-query.util.js';
import { contacts, contact_phones } from './contacts.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { LEAD_OPEN_STATUS_VALUES } from '@/domains/app/sub-domains/leads/leads.constants.js';

/** The `phones` of a contact (`app.contact_phones`) — the primary first, then by number (CT2). */
export const CONTACT_PHONES_CHILD: BaseRecordChildTable = {
  table: contact_phones,
  ownerColumn: 'contact_id',
  columns: ['phone', 'is_primary', 'is_on_whatsapp'],
  copiedFromOwner: { household_contact_id: 'household_contact_id' },
  order: ['-is_primary', 'phone'],
};

/** A live number on a contact of another household — the `contact_phone_exists` clash (CT3). */
export interface ContactPhoneClash {
  phone: string;
  contact_public_id: string;
  contact_number: number;
  first_name: string;
  last_name: string | null;
}

/** A contact without a last name sorts as if it were empty (the name index's expression). */
const lastNameKey = sql`coalesce(${contacts.last_name}, '')`;

/**
 * How well a contact matches `q` (CT9): 0 when the name starts with it or the primary number holds
 * it, 1 when a word of the search text starts with it, else 2 — the `match` sort's first key.
 */
function matchRank(_organizationId: number, query: BaseRecordListQuery): SQL {
  if (!query.q) return sql`0`;
  const term = query.q.toLowerCase();
  const prefix = `${escapeLikeTerm(term)}%`;
  return sql`(case
    when lower(${contacts.first_name} || ' ' || ${lastNameKey}) like ${prefix} then 0
    when ${contacts.primary_phone} like ${buildContainsLikePattern(term)} then 0
    when ${contacts.search_text} like ${`% ${prefix}`} then 1
    else 2
  end)`;
}

/**
 * Persistence for `app.contacts` (launch ROUTE #129, routes-final 4.A) — the shared app record
 * reads and writes on its table, plus the number checks of the household rule (CT3).
 *
 * @remarks
 * - **Algorithm:** `q` matches the trigger-kept `search_text` (names, email, Instagram, every live
 *   number's 10 digits, `c-<number>`) behind its trigram index, or the contact number. Sorts: `name`
 *   (first, then last name — the name index), `match` (the best match for `q` first, then the name),
 *   `created_at` and `last_activity_at` (newest first; a contact with no activity last). The
 *   derived filters read the numbers (`phone`), the reply state, the tags (`&&`, the GIN index) —
 *   `has_open_lead` (a live lead in an open status, L6) and `is_patient`, which no contact can be
 *   until #133 (D61).
 * - **Failure modes:** a unique or exclusion violation propagates (the service maps it).
 */
export class ContactsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: contacts,
      entity: 'contact',
      searchColumns: ['search_text'],
      numberColumn: 'contact_number',
      sortColumns: { created_at: 'created_at' },
      sortKeys: {
        name: {
          keys: [{ value: 'first_name' }, { value: () => lastNameKey, sqlType: 'text' }],
          defaultOrder: 'asc',
        },
        match: {
          keys: [
            { value: matchRank, sqlType: 'integer' },
            { value: 'first_name' },
            { value: () => lastNameKey, sqlType: 'text' },
          ],
          defaultOrder: 'asc',
        },
        created_at: { keys: [{ value: 'created_at' }], defaultOrder: 'desc' },
        last_activity_at: {
          keys: [
            {
              value: () => sql`coalesce(${contacts.last_activity_at}, '-infinity'::timestamptz)`,
              sqlType: 'timestamptz',
            },
          ],
          defaultOrder: 'desc',
        },
      },
      derivedFilters: {
        phone: (value, organizationId) =>
          sql`exists (select 1 from ${contact_phones} where ${contact_phones.contact_id} = ${contacts.id} and ${contact_phones.organization_id} = ${organizationId} and ${contact_phones.phone} = ${value} and ${contact_phones.deleted_at} is null)`,
        is_awaiting_reply: (value) => {
          const awaiting = sql`(${contacts.last_received_at} is not null and (${contacts.last_sent_at} is null or ${contacts.last_received_at} > ${contacts.last_sent_at}))`;
          return value === true ? awaiting : sql`not ${awaiting}`;
        },
        preference_tags: (value) =>
          sql`${contacts.preference_tags} && array[${sql.join(
            (value as string[]).map((tag) => sql`${tag}`),
            sql`, `,
          )}]::text[]`,
        // No contact is a patient until patient files point at contacts (#133, D61).
        is_patient: (value) => (value === true ? sql`false` : sql`true`),
        has_open_lead: (value) => {
          const open = sql`exists (select 1 from ${leads} where ${leads.contact_id} = ${contacts.id} and ${leads.deleted_at} is null and ${leads.status} in (${sql.join(
            LEAD_OPEN_STATUS_VALUES.map((status) => sql`${status}`),
            sql`, `,
          )}))`;
          return value === true ? open : sql`not ${open}`;
        },
      },
      defaultSort: 'name',
      defaultOrder: 'asc',
    });
  }

  /**
   * The first live number among `phones` that sits on a contact of another household — the clash
   * the exclusion constraint would refuse (CT3) — or null.
   *
   * @remarks
   * - **Algorithm:** one read of the `(organization_id, phone)` index joined to the contact; a
   *   contact's own numbers never clash with it (`contactId`). `householdContactId` null = a new
   *   household, so every live number elsewhere clashes.
   */
  async findPhoneClash(options: {
    organizationId: number;
    phones: readonly string[];
    householdContactId: number | null;
    contactId: number | null;
  }): Promise<ContactPhoneClash | null> {
    if (options.phones.length === 0) return null;
    const rows = await getRequestDatabase()
      .select({
        phone: contact_phones.phone,
        contact_public_id: contacts.public_id,
        contact_number: contacts.contact_number,
        first_name: contacts.first_name,
        last_name: contacts.last_name,
      })
      .from(contact_phones)
      .innerJoin(contacts, eq(contacts.id, contact_phones.contact_id))
      .where(
        and(
          eq(contact_phones.organization_id, options.organizationId),
          inArray(contact_phones.phone, [...options.phones]),
          isNull(contact_phones.deleted_at),
          options.householdContactId === null
            ? undefined
            : ne(contact_phones.household_contact_id, options.householdContactId),
          options.contactId === null ? undefined : ne(contact_phones.contact_id, options.contactId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** How many other contacts (live or deleted) a household's first contact holds. */
  async countHouseholdMembers(contactId: number): Promise<number> {
    const rows = await getRequestDatabase()
      .select({ total: count() })
      .from(contacts)
      .where(and(eq(contacts.household_contact_id, contactId), ne(contacts.id, contactId)));
    return Number(rows[0]?.total ?? 0);
  }

  /** Sets (a soft delete) or clears (a restore) the delete time of a contact's numbers. */
  async setPhonesDeletedAt(contactId: number, deletedAt: Date | null): Promise<void> {
    await getRequestDatabase()
      .update(contact_phones)
      .set({ deleted_at: deletedAt })
      .where(eq(contact_phones.contact_id, contactId));
  }

  /**
   * Writes what an activity entry changes on its contact (CT10, CT4, M7): the last activity, and
   * for a sent or received message or call the last sent / received time; a sent one also moves
   * `default_channel`.
   *
   * @remarks
   * - **Algorithm:** one `UPDATE` with `greatest(...)`, so an entry written late never moves a time
   *   back. It leaves `updated_at` / `updated_by_user_id` alone — the stream is not an edit of the
   *   contact, and a desk save in progress must not read it as one (`record_changed`, D43).
   */
  async recordActivity(options: {
    contactId: number;
    occurredAt: Date;
    direction: string | null;
    channel: string | null;
  }): Promise<void> {
    const at = sql`${options.occurredAt.toISOString()}::timestamptz`;
    const latest = (column: AnyPgColumn) =>
      sql`greatest(coalesce(${column}, '-infinity'::timestamptz), ${at})`;
    await getRequestDatabase()
      .update(contacts)
      .set({
        last_activity_at: latest(contacts.last_activity_at),
        ...(options.direction === 'sent'
          ? {
              last_sent_at: latest(contacts.last_sent_at),
              ...(options.channel === null ? {} : { default_channel: options.channel }),
            }
          : {}),
        ...(options.direction === 'received'
          ? { last_received_at: latest(contacts.last_received_at) }
          : {}),
      })
      .where(eq(contacts.id, options.contactId));
  }
}
