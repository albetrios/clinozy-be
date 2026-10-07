import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgPolicy,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import {
  PHONE_NUMBER_PATTERN,
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  PATIENT_GENDER_VALUES,
  PATIENT_TYPES_VALUES,
  PATIENT_STATUS_VALUES,
  PATIENT_CONVERSION_VALUES,
  PATIENT_REFERRAL_SOURCE_VALUES,
  PATIENT_DEFAULT_CHANNEL_VALUES,
} from '@/domains/app/sub-domains/patients/patients.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.patients` — A registered patient (launch ROUTE #13, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `patients_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const patients = appSchema
  .table(
    'patients',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // The "#3508" of the patient list — per organization, never reused
      patient_number: integer('patient_number').notNull().default(0),
      first_name: varchar('first_name', { length: 60 }).notNull(),
      last_name: varchar('last_name', { length: 60 }),
      phone: varchar('phone', { length: 16 }).notNull(),
      // More mobiles (`+91…`)
      phones: text('phones').array().notNull().default([]),
      email: varchar('email', { length: 254 }),
      gender: varchar('gender', { length: 6 }),
      date_of_birth: date('date_of_birth', { mode: 'string' }),
      address: varchar('address', { length: 240 }),
      home_branch_id: bigint('home_branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'no action' }),
      types: text('types').array().notNull().default([]),
      status: varchar('status', { length: 8 }).notNull().default('new'),
      conversion: varchar('conversion', { length: 13 }).notNull().default('not_converted'),
      referral_source: varchar('referral_source', { length: 9 }),
      referred_by_patient_id: bigint('referred_by_patient_id', { mode: 'number' }).references(
        (): AnyPgColumn => patients.id,
        { onDelete: 'set null' },
      ),
      referred_by_name: varchar('referred_by_name', { length: 120 }),
      doctor_membership_id: bigint('doctor_membership_id', { mode: 'number' }).references(
        () => memberships.id,
        { onDelete: 'set null' },
      ),
      follow_up_at: timestamp('follow_up_at', { withTimezone: true }),
      notes: text('notes'),
      lead_id: bigint('lead_id', { mode: 'number' }).references((): AnyPgColumn => leads.id, {
        onDelete: 'set null',
      }),
      // Data consent (D39: AI ideas only with it)
      has_data_consent: boolean('has_data_consent').notNull().default(false),
      has_photo_consent: boolean('has_photo_consent').notNull().default(false),
      has_marketing_consent: boolean('has_marketing_consent').notNull().default(false),
      language: varchar('language', { length: 20 }),
      instagram_handles: text('instagram_handles').array().notNull().default([]),
      default_channel: varchar('default_channel', { length: 9 }),
      preferences: jsonb('preferences').notNull().default({}),
      household: varchar('household', { length: 240 }),
      allergies: text('allergies').array().notNull().default([]),
      contraindications: text('contraindications').array().notNull().default([]),
      // What `q` searches — one trigram-indexed column (schema review H5).
      search_text: text('search_text').generatedAlwaysAs(
        sql`"first_name" || ' ' || coalesce("last_name", '') || ' ' || "phone" || ' ' || coalesce("email", '')`,
      ),
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
      uniqueIndex('idx_patients_public_id').on(table.public_id),
      index('idx_patients_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_patients_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_patients_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patients_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_patients_organization_first_name')
        .on(table.organization_id, table.first_name, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_patients_home_branch_id').on(table.home_branch_id),
      index('idx_patients_referred_by_patient_id')
        .on(table.referred_by_patient_id)
        .where(sql`${table.referred_by_patient_id} IS NOT NULL`),
      index('idx_patients_doctor_membership_id')
        .on(table.doctor_membership_id)
        .where(sql`${table.doctor_membership_id} IS NOT NULL`),
      index('idx_patients_organization_follow_up_at')
        .on(table.organization_id, table.follow_up_at, table.id)
        .where(sql`${table.deleted_at} IS NULL AND ${table.follow_up_at} IS NOT NULL`),
      index('idx_patients_lead_id').on(table.lead_id).where(sql`${table.lead_id} IS NOT NULL`),
      index('idx_patients_search_text_trgm')
        .using('gin', table.search_text.op('gin_trgm_ops'))
        .where(sql`${table.deleted_at} IS NULL`),
      uniqueIndex('idx_patients_organization_patient_number').on(
        table.organization_id,
        table.patient_number,
      ),
      check('chk_patients_patient_number', sql`${table.patient_number} > 0`),
      check('chk_patients_phone', sql`${table.phone} ~ ${sql.raw(`'${PHONE_NUMBER_PATTERN}'`)}`),
      check('chk_patients_gender', sql`${table.gender} IN (${joinValues(PATIENT_GENDER_VALUES)})`),
      check(
        'chk_patients_types',
        sql`${table.types} <@ ARRAY[${joinValues(PATIENT_TYPES_VALUES)}]::text[]`,
      ),
      check('chk_patients_status', sql`${table.status} IN (${joinValues(PATIENT_STATUS_VALUES)})`),
      check(
        'chk_patients_conversion',
        sql`${table.conversion} IN (${joinValues(PATIENT_CONVERSION_VALUES)})`,
      ),
      check(
        'chk_patients_referral_source',
        sql`${table.referral_source} IN (${joinValues(PATIENT_REFERRAL_SOURCE_VALUES)})`,
      ),
      check(
        'chk_patients_default_channel',
        sql`${table.default_channel} IN (${joinValues(PATIENT_DEFAULT_CHANNEL_VALUES)})`,
      ),
      check(
        'chk_patients_referred_by_patient',
        sql`${table.referred_by_patient_id} IS NULL OR ${table.referral_source} = 'patient'`,
      ),
      check(
        'chk_patients_date_of_birth_past',
        sql`${table.date_of_birth} IS NULL OR ${table.date_of_birth} <= CURRENT_DATE`,
      ),
      check('chk_patients_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patients_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patients_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patients_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('patients_tenant_isolation', {
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
