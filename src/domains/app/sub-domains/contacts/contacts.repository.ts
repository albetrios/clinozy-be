import { and, count, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import {
  BaseRecordRepository,
  type BaseRecordChildTable,
  type BaseRecordListQuery,
} from '@/domains/app/base-record.repository.js';
import {
  buildContainsLikePattern,
  buildSearchCondition,
  escapeLikeTerm,
  searchWords,
} from '@/shared/utils/http/list-query.util.js';
import { contacts, contact_phones } from './contacts.schema.js';
import type { ContactLinkedSearch } from './contacts.validator.js';
import type { ContactSummaryRow } from './contacts.types.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
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

/** Joins a search's alternatives (any one matches). */
const OR_SEPARATOR = sql` or `;

/** A contact without a last name sorts as if it were empty (the name index's expression). */
const lastNameKey = sql`coalesce(${contacts.last_name}, '')`;

/**
 * How well a contact matches `q` (CT9, NS7): 0 when the name starts with the whole of it or the
 * primary number holds it, 1 when the name or a word of the search text starts with its first word,
 * else 2 — the `match` sort's first key. A one-word `q` ranks as it always did.
 */
function matchRank(_organizationId: number, query: BaseRecordListQuery): SQL {
  if (!query.q) return sql`0`;
  const term = query.q.toLowerCase();
  const prefix = `${escapeLikeTerm(term)}%`;
  const firstWordPrefix = `${escapeLikeTerm(searchWords(term)[0] ?? term)}%`;
  const name = sql`lower(${contacts.first_name} || ' ' || ${lastNameKey})`;
  return sql`(case
    when ${name} like ${prefix} then 0
    when ${contacts.primary_phone} like ${buildContainsLikePattern(term)} then 0
    when ${name} like ${firstWordPrefix} then 1
    when ${contacts.search_text} like ${`% ${firstWordPrefix}`} then 1
    else 2
  end)`;
}

/**
 * The contacts whose live patient file carries `patientNumber` — an `IN` over the organization's
 * patient-number index (SHELL-M1).
 */
function patientNumberCondition(patientNumber: number, organizationId: number): SQL {
  return sql`${contacts.id} in (select ${patients.contact_id} from ${patients} where ${patients.organization_id} = ${organizationId} and ${patients.patient_number} = ${patientNumber} and ${patients.deleted_at} is null)`;
}

/**
 * The contacts whose live lead (open or closed) carries `leadNumber` — an `IN` over the
 * organization's lead-number index (SHELL-M1).
 */
function leadNumberCondition(leadNumber: number, organizationId: number): SQL {
  return sql`${contacts.id} in (select ${leads.contact_id} from ${leads} where ${leads.organization_id} = ${organizationId} and ${leads.lead_number} = ${leadNumber} and ${leads.deleted_at} is null)`;
}

/**
 * The condition of a list about a contact for its `q` (leads L7, appointments 6.8 —
 * `readContactLinkedSearch`): the contact's trigram-indexed search text holding every word of it
 * (NS5), or its contact number (an `IN` over the organization's contacts), or the record's own
 * number — any of them; `false` when the search reads as none.
 */
export function contactLinkedSearchCondition(options: {
  search: ContactLinkedSearch;
  /** The record's column naming its contact (`leads.contact_id`). */
  contactIdColumn: AnyPgColumn;
  /** The record's running-number column (`leads.lead_number`). */
  recordNumberColumn: AnyPgColumn;
  organizationId: number;
}): SQL {
  const { search, contactIdColumn, organizationId } = options;
  const conditions: SQL[] = [];
  const text = buildSearchCondition({
    columns: [contacts.search_text],
    q: search.text,
    everyWord: true,
  });
  if (text !== undefined) {
    conditions.push(
      sql`${contactIdColumn} in (select ${contacts.id} from ${contacts} where ${contacts.organization_id} = ${organizationId} and ${text})`,
    );
  }
  if (search.contactNumber !== undefined) {
    conditions.push(
      sql`${contactIdColumn} in (select ${contacts.id} from ${contacts} where ${contacts.organization_id} = ${organizationId} and ${contacts.contact_number} = ${search.contactNumber})`,
    );
  }
  if (search.recordNumber !== undefined) {
    conditions.push(eq(options.recordNumberColumn, search.recordNumber));
  }
  return conditions.length === 0 ? sql`false` : sql`(${sql.join(conditions, OR_SEPARATOR)})`;
}

/**
 * Persistence for `app.contacts` (launch ROUTE #129, routes-final 4.A) — the shared app record
 * reads and writes on its table, plus the number checks of the household rule (CT3).
 *
 * @remarks
 * - **Algorithm:** every word of `q` (NS5) matches the trigger-kept `search_text` (names, email,
 *   Instagram, every live number's 10 digits, `c-<number>`) behind its trigram index, or `q` is the
 *   contact number. Sorts: `name`
 *   (first, then last name — the name index), `match` (the best match for `q` first, then the name),
 *   `created_at` and `last_activity_at` (newest first; a contact with no activity last). The
 *   derived filters read the record numbers `q` names (`record_number` — the live patient file's or
 *   lead's number, `#2371`; `patient_number` — `PT-0412`, SHELL-M1), the numbers (`phone`), the
 *   reply state, the tags (`&&`, the GIN index) — `has_open_lead` (a live lead in an open status,
 *   L6) and `is_patient` (a live patient file — opened by a check-in since #132).
 * - **Failure modes:** a unique or exclusion violation propagates (the service maps it).
 */
export class ContactsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: contacts,
      entity: 'contact',
      searchColumns: ['search_text'],
      searchEveryWord: true,
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
        record_number: (value, organizationId) =>
          sql`(${patientNumberCondition(value as number, organizationId)} or ${leadNumberCondition(value as number, organizationId)})`,
        patient_number: (value, organizationId) =>
          patientNumberCondition(value as number, organizationId),
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
        is_patient: (value) => {
          const file = sql`exists (select 1 from ${patients} where ${patients.contact_id} = ${contacts.id} and ${patients.deleted_at} is null)`;
          return value === true ? file : sql`not ${file}`;
        },
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

  /**
   * What a record about a contact shows of it (a lead's or an appointment's `contact`, L1, A1) and
   * its activity fields, by the contacts' public ids — one read for a page.
   */
  async findSummaries(
    publicIds: readonly string[],
    organizationId: number,
  ): Promise<ContactSummaryRow[]> {
    if (publicIds.length === 0) return [];
    return getRequestDatabase()
      .select({
        id: contacts.public_id,
        contact_number: contacts.contact_number,
        first_name: contacts.first_name,
        last_name: contacts.last_name,
        primary_phone: contacts.primary_phone,
        preference_tags: contacts.preference_tags,
        default_channel: contacts.default_channel,
        last_activity_at: contacts.last_activity_at,
        last_sent_at: contacts.last_sent_at,
        last_received_at: contacts.last_received_at,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.organization_id, organizationId),
          inArray(contacts.public_id, [...publicIds]),
        ),
      );
  }

  /**
   * The live patient file of each contact (P1 — at most one), by the contacts' public ids: its
   * public id and number.
   */
  async findPatientFiles(
    contactPublicIds: readonly string[],
    organizationId: number,
  ): Promise<Map<string, { id: string; patient_number: number }>> {
    if (contactPublicIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        contact_public_id: contacts.public_id,
        id: patients.public_id,
        patient_number: patients.patient_number,
      })
      .from(patients)
      .innerJoin(contacts, eq(contacts.id, patients.contact_id))
      .where(
        and(
          eq(patients.organization_id, organizationId),
          inArray(contacts.public_id, [...contactPublicIds]),
          isNull(patients.deleted_at),
        ),
      );
    return new Map(rows.map(({ contact_public_id, ...file }) => [contact_public_id, file]));
  }

  /**
   * The contact's live patient file (P1 — at most one), or null: whether the check-in opens one
   * (A14), whether another may be added or restored (`contact_is_patient`).
   */
  async findPatientFile(
    contactId: number,
  ): Promise<{ id: number; public_id: string; patient_number: number } | null> {
    const rows = await getRequestDatabase()
      .select({
        id: patients.id,
        public_id: patients.public_id,
        patient_number: patients.patient_number,
      })
      .from(patients)
      .where(and(eq(patients.contact_id, contactId), isNull(patients.deleted_at)))
      .limit(1);
    return rows[0] ?? null;
  }
}
