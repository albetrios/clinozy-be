import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgPolicy,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteral } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import {
  PHONE_NUMBER_PATTERN,
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  CONTACT_DEFAULT_CHANNEL_VALUES,
  CONTACT_GENDER_VALUES,
  CONTACT_INSTAGRAM_HANDLES_MAX,
  CONTACT_PREFERENCE_TAG_PATTERN,
  CONTACT_PREFERENCE_TAGS_MAX,
  CONTACT_REFERRAL_SOURCE,
  CONTACT_REFERRAL_SOURCE_VALUES,
} from '@/domains/app/sub-domains/contacts/contacts.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/** The tag pattern as a list of comma-joined tags — `CHECK` on `array_to_string(tags, ',')` (CT14). */
const TAG_BODY = CONTACT_PREFERENCE_TAG_PATTERN.slice(1, -1);
/** The whole tag list as one comma-joined text — empty, or tags each matching the tag pattern. */
const PREFERENCE_TAGS_PATTERN = `^(${TAG_BODY}(,${TAG_BODY})*)?$`;

/**
 * Drizzle table for `app.contacts` — one person, shared by their leads, conversation, patient file
 * and appointments (launch ROUTE #129, routes-final 4.A; domain `app`, sub-domain `contacts` at the
 * folder root).
 *
 * @remarks
 * - **Notes:** written by triggers as well as by the service — `contact_number` from the
 *   organization's counter (`trg_contacts_contact_number`), `household_contact_id` defaulting to the
 *   row itself (`trg_contacts_household`) and `search_text` from the names, email, Instagram, the
 *   contact number and every live number's 10 digits (`trg_contacts_search_text`, kept current from
 *   `app.contact_phones` by `trg_contact_phones_search_text`) — see the baseline migration.
 *   `primary_phone` is the service's copy of the primary number (CT2); `last_*_at` are written with
 *   each activity entry (CT10). RLS is the organization policy with the retention-cleanup arm for
 *   the deleted-record purge; not branch-scoped (CT6).
 */
export const contacts = appSchema
  .table(
    'contacts',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // "C-12345" — per organization, never reused
      contact_number: integer('contact_number').notNull().default(0),
      first_name: varchar('first_name', { length: 60 }).notNull(),
      last_name: varchar('last_name', { length: 60 }),
      gender: varchar('gender', { length: 6 }),
      date_of_birth: date('date_of_birth', { mode: 'string' }),
      // true when date_of_birth came from a typed age (the organization's today minus it)
      date_of_birth_is_approximate: boolean('date_of_birth_is_approximate')
        .notNull()
        .default(false),
      email: varchar('email', { length: 120 }),
      // "Area, city"
      address: varchar('address', { length: 240 }),
      instagram_handles: text('instagram_handles').array().notNull().default([]),
      default_channel: varchar('default_channel', { length: 9 }).notNull().default('whatsapp'),
      preference_tags: text('preference_tags').array().notNull().default([]),
      has_marketing_consent: boolean('has_marketing_consent').notNull().default(false),
      referral_source: varchar('referral_source', { length: 9 }),
      referred_by_contact_id: bigint('referred_by_contact_id', { mode: 'number' }).references(
        (): AnyPgColumn => contacts.id,
        { onDelete: 'set null' },
      ),
      referred_by_name: varchar('referred_by_name', { length: 120 }),
      // The household's first contact — the row itself when it is the first (CT3)
      household_contact_id: bigint('household_contact_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => contacts.id, { onDelete: 'restrict' }),
      primary_phone: varchar('primary_phone', { length: 13 }).notNull(),
      last_activity_at: timestamp('last_activity_at', { withTimezone: true }),
      last_sent_at: timestamp('last_sent_at', { withTimezone: true }),
      last_received_at: timestamp('last_received_at', { withTimezone: true }),
      search_text: text('search_text').notNull().default(''),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
      updated_by_user_id: bigint('updated_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
      deleted_at: timestamp('deleted_at', { withTimezone: true }),
      delete_reason: varchar('delete_reason', { length: 20 }),
      delete_note: varchar('delete_note', { length: 280 }),
    },
    (table) => [
      uniqueIndex('idx_contacts_public_id').on(table.public_id),
      uniqueIndex('idx_contacts_organization_contact_number').on(
        table.organization_id,
        table.contact_number,
      ),
      // The target of the phones' composite key — a number follows its contact's household (CT3)
      uniqueIndex('idx_contacts_id_household_contact_id').on(table.id, table.household_contact_id),
      index('idx_contacts_search_text_trgm')
        .using('gin', table.search_text.op('gin_trgm_ops'))
        .where(sql`${table.deleted_at} IS NULL`),
      // The name sort (default): a contact without a last name sorts as if it were empty
      index('idx_contacts_organization_name')
        .on(
          table.organization_id,
          table.first_name,
          sql`coalesce(${table.last_name}, '')`,
          table.id,
        )
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_contacts_organization_created')
        .on(table.organization_id, table.created_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      // The recency sort: a contact with no activity yet sorts as the oldest
      index('idx_contacts_organization_last_activity_at')
        .on(
          table.organization_id,
          sql`coalesce(${table.last_activity_at}, '-infinity'::timestamptz)`,
          table.id,
        )
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_contacts_preference_tags_gin')
        .using('gin', table.preference_tags)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_contacts_household_contact_id').on(table.household_contact_id),
      index('idx_contacts_referred_by_contact_id')
        .on(table.referred_by_contact_id)
        .where(sql`${table.referred_by_contact_id} IS NOT NULL`),
      index('idx_contacts_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_contacts_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_contacts_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_contacts_contact_number', sql`${table.contact_number} > 0`),
      check('chk_contacts_first_name', sql`length(btrim(${table.first_name})) > 0`),
      check('chk_contacts_gender', sql`${table.gender} IN (${joinValues(CONTACT_GENDER_VALUES)})`),
      check(
        'chk_contacts_date_of_birth_past',
        sql`${table.date_of_birth} IS NULL OR ${table.date_of_birth} <= CURRENT_DATE`,
      ),
      check(
        'chk_contacts_date_of_birth_approximate',
        sql`NOT ${table.date_of_birth_is_approximate} OR ${table.date_of_birth} IS NOT NULL`,
      ),
      check(
        'chk_contacts_instagram_handles',
        sql`cardinality(${table.instagram_handles}) <= ${sql.raw(String(CONTACT_INSTAGRAM_HANDLES_MAX))}`,
      ),
      check(
        'chk_contacts_default_channel',
        sql`${table.default_channel} IN (${joinValues(CONTACT_DEFAULT_CHANNEL_VALUES)})`,
      ),
      check(
        'chk_contacts_preference_tags',
        sql`cardinality(${table.preference_tags}) <= ${sqlLiteral(CONTACT_PREFERENCE_TAGS_MAX)} AND array_to_string(${table.preference_tags}, ',') ~ ${sqlLiteral(PREFERENCE_TAGS_PATTERN)}`,
      ),
      check(
        'chk_contacts_referral_source',
        sql`${table.referral_source} IN (${joinValues(CONTACT_REFERRAL_SOURCE_VALUES)})`,
      ),
      check(
        'chk_contacts_referred_by_patient',
        sql`${table.referred_by_contact_id} IS NULL OR ${table.referral_source} = ${CONTACT_REFERRAL_SOURCE.PATIENT}`,
      ),
      check(
        'chk_contacts_primary_phone',
        sql`${table.primary_phone} ~ ${sqlLiteral(PHONE_NUMBER_PATTERN)}`,
      ),
      check('chk_contacts_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_contacts_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_contacts_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_contacts_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('contacts_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR ${maintenanceBypassArm('app.global_retention_cleanup')}`,
        withCheck: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`,
      }),
    ],
  )
  .enableRLS();

/**
 * Drizzle table `app.contact_phones` — a contact's numbers (CT2, CT3): 1–5, exactly one primary,
 * no public id (part of the contact, written with it).
 *
 * @remarks
 * - **Notes:** the composite key `(contact_id, household_contact_id)` → `app.contacts (id,
 *   household_contact_id)` follows a household move (`ON UPDATE CASCADE`), and the baseline
 *   migration's `EXCLUDE` constraint `excl_contact_phones_phone_household` keeps a live number inside
 *   one household — Drizzle has no exclusion constraints, so it lives only there. `deleted_at`
 *   follows the contact's soft delete. RLS is the organization policy.
 */
export const contact_phones = appSchema
  .table(
    'contact_phones',
    {
      contact_id: bigint('contact_id', { mode: 'number' }).notNull(),
      household_contact_id: bigint('household_contact_id', { mode: 'number' }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      phone: varchar('phone', { length: 13 }).notNull(),
      is_primary: boolean('is_primary').notNull().default(false),
      is_on_whatsapp: boolean('is_on_whatsapp').notNull().default(true),
      deleted_at: timestamp('deleted_at', { withTimezone: true }),
    },
    (table) => [
      index('idx_contact_phones_contact_household').on(
        table.contact_id,
        table.household_contact_id,
      ),
      primaryKey({ name: 'contact_phones_pkey', columns: [table.contact_id, table.phone] }),
      foreignKey({
        name: 'contact_phones_contact_household_fk',
        columns: [table.contact_id, table.household_contact_id],
        foreignColumns: [contacts.id, contacts.household_contact_id],
      })
        .onUpdate('cascade')
        .onDelete('cascade'),
      uniqueIndex('idx_contact_phones_contact_id_primary')
        .on(table.contact_id)
        .where(sql`${table.is_primary}`),
      index('idx_contact_phones_organization_id_phone').on(table.organization_id, table.phone),
      index('idx_contact_phones_household_contact_id').on(table.household_contact_id),
      check('chk_contact_phones_phone', sql`${table.phone} ~ ${sqlLiteral(PHONE_NUMBER_PATTERN)}`),
      pgPolicy('contact_phones_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`,
        withCheck: sql`${table.organization_id} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`,
      }),
    ],
  )
  .enableRLS();
