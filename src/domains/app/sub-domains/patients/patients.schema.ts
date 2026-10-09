import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  PATIENT_CLINICAL_LIST_MAX,
  PATIENT_CONVERSION_VALUES,
  PATIENT_NOTES_MAX,
  PATIENT_STATUS_VALUES,
  PATIENT_TYPES_VALUES,
} from '@/domains/app/sub-domains/patients/patients.constants.js';

/**
 * Drizzle table for `app.patients` — the clinical side of a contact: consents, allergies, usual
 * doctor, home branch, status (launch ROUTE #133, routes-final 7.A).
 *
 * @remarks
 * - **Notes:** the person lives on the contact (P1, P2 — `ON DELETE RESTRICT`), one live file per
 *   contact (`idx_patients_organization_contact_unique`); `patient_number` from the organization's
 *   counter (`trg_patients_patient_number`); the usual doctor a K8 composite key `RESTRICT`, kept
 *   when they leave (K2). Never purged (P7): soft delete only, so the policy has no retention arm.
 *   Not branch-scoped (P6).
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
      // The "PT-0412" of the patient list — per organization, never reused
      patient_number: integer('patient_number').notNull().default(0),
      // The person (P1)
      contact_id: bigint('contact_id', { mode: 'number' })
        .notNull()
        .references(() => contacts.id, { onDelete: 'restrict' }),
      home_branch_id: bigint('home_branch_id', { mode: 'number' })
        .notNull()
        .references(() => branches.id, { onDelete: 'restrict' }),
      types: text('types').array().notNull().default([]),
      status: varchar('status', { length: 8 }).notNull().default('new'),
      // Took a treatment (P4)
      conversion: varchar('conversion', { length: 13 }).notNull().default('not_converted'),
      // The usual doctor
      doctor_membership_id: bigint('doctor_membership_id', { mode: 'number' }),
      follow_up_at: timestamp('follow_up_at', { withTimezone: true }),
      notes: text('notes'),
      // The lead they came from — set at the check-in that opened the file (P10)
      lead_id: bigint('lead_id', { mode: 'number' }).references((): AnyPgColumn => leads.id, {
        onDelete: 'set null',
      }),
      has_data_consent: boolean('has_data_consent').notNull().default(false),
      has_photo_consent: boolean('has_photo_consent').notNull().default(false),
      allergies: text('allergies').array().notNull().default([]),
      contraindications: text('contraindications').array().notNull().default([]),
      // The AI offering ideas are due a refresh since then (D80, WC-47) — set by the database's
      // triggers, cleared by the refresh
      ideas_stale_since: timestamp('ideas_stale_since', { withTimezone: true }),
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
      uniqueIndex('idx_patients_organization_patient_number').on(
        table.organization_id,
        table.patient_number,
      ),
      // P1: one live file per contact
      uniqueIndex('idx_patients_organization_contact_unique')
        .on(table.organization_id, table.contact_id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_patients_organization_created')
        .on(table.organization_id, table.created_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_patients_organization_follow_up_at')
        .on(table.organization_id, table.follow_up_at, table.id)
        .where(sql`${table.deleted_at} IS NULL AND ${table.follow_up_at} IS NOT NULL`),
      index('idx_patients_types_gin')
        .using('gin', table.types)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_patients_home_branch_id').on(table.home_branch_id),
      index('idx_patients_doctor_membership_id')
        .on(table.organization_id, table.doctor_membership_id)
        .where(sql`${table.doctor_membership_id} IS NOT NULL`),
      index('idx_patients_lead_id').on(table.lead_id).where(sql`${table.lead_id} IS NOT NULL`),
      index('idx_patients_contact_id').on(table.contact_id),
      index('idx_patients_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      // The ideas sweep (D80): files due a refresh, per organization, oldest mark first
      index('idx_patients_ideas_stale')
        .on(table.organization_id, table.ideas_stale_since)
        .where(sql`${table.ideas_stale_since} IS NOT NULL AND ${table.deleted_at} IS NULL`),
      index('idx_patients_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patients_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      // K8: a member of this organization, kept when they leave (K2)
      foreignKey({
        name: 'patients_doctor_membership_fk',
        columns: [table.organization_id, table.doctor_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      check('chk_patients_patient_number', sql`${table.patient_number} > 0`),
      check(
        'chk_patients_types',
        sql`${table.types} <@ ARRAY[${sqlLiteralList(PATIENT_TYPES_VALUES)}]::text[] AND cardinality(${table.types}) <= ${sql.raw(String(PATIENT_TYPES_VALUES.length))}`,
      ),
      check(
        'chk_patients_status',
        sql`${table.status} IN (${sqlLiteralList(PATIENT_STATUS_VALUES)})`,
      ),
      check(
        'chk_patients_conversion',
        sql`${table.conversion} IN (${sqlLiteralList(PATIENT_CONVERSION_VALUES)})`,
      ),
      check(
        'chk_patients_notes',
        sql`char_length(${table.notes}) <= ${sql.raw(String(PATIENT_NOTES_MAX))}`,
      ),
      check(
        'chk_patients_allergies',
        sql`cardinality(${table.allergies}) <= ${sql.raw(String(PATIENT_CLINICAL_LIST_MAX))}`,
      ),
      check(
        'chk_patients_contraindications',
        sql`cardinality(${table.contraindications}) <= ${sql.raw(String(PATIENT_CLINICAL_LIST_MAX))}`,
      ),
      check('chk_patients_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patients_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patients_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patients_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('patients_tenant_isolation', {
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
      // The AI ideas sweep (WC-47, D80) reads the stale marks across organizations — a read only:
      // a patient file is never purged (P7), so the maintenance role gets no write arm here.
      pgPolicy('patients_ideas_sweep_read', {
        as: 'permissive',
        for: 'select',
        to: 'public',
        using: sql`${maintenanceBypassArm('app.global_retention_cleanup')}`,
      }),
    ],
  )
  .enableRLS();
