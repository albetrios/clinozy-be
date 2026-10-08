import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  date,
  index,
  pgPolicy,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  PATIENT_REVIEW_ACTION_RATING_MAX,
  PATIENT_REVIEW_FILE_KEYS_MAX,
  PATIENT_REVIEW_SOURCE_VALUES,
} from '@/domains/app/sub-domains/patients/patient-reviews/patient-reviews.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` or `ARRAY[…]` CHECK. */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/**
 * Drizzle table for `app.patient_reviews` — a review the patient gave, on Google, video, Instagram,
 * the clinic's form or WhatsApp (launch ROUTE #134, routes-final 7.J).
 *
 * @remarks
 * - **Notes:** `link` must be `https://` (`chk_patient_reviews_link`, TR11); `file_keys` confirmed
 *   uploads (checked by the application), up to 10; the call-back index serves sub-domain 10's rule
 *   (a rating ≤ 3). The patient `ON DELETE RESTRICT` (P7). RLS on the organization GUC with the
 *   retention-cleanup arm for the deleted-record purge; not branch-scoped.
 */
export const patient_reviews = appSchema
  .table(
    'patient_reviews',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      patient_id: bigint('patient_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => patients.id, { onDelete: 'restrict' }),
      appointment_id: bigint('appointment_id', { mode: 'number' }).references(
        (): AnyPgColumn => appointments.id,
        { onDelete: 'set null' },
      ),
      source: varchar('source', { length: 13 }).notNull(),
      rating: smallint('rating'),
      text: varchar('text', { length: 2000 }),
      link: varchar('link', { length: 500 }),
      // Confirmed uploads of the organization (TR11)
      file_keys: text('file_keys').array().notNull().default([]),
      review_date: date('review_date', { mode: 'string' }).notNull(),
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
      index('idx_patient_reviews_organization_id').on(table.organization_id),
      uniqueIndex('idx_patient_reviews_public_id').on(table.public_id),
      index('idx_patient_reviews_patient_date').on(
        table.patient_id,
        table.review_date.desc(),
        table.id,
      ),
      // Sub-domain 10's call-back rule
      index('idx_patient_reviews_organization_needs_call')
        .on(table.organization_id, table.created_at)
        .where(
          sql`${table.deleted_at} IS NULL AND ${table.rating} <= ${sql.raw(String(PATIENT_REVIEW_ACTION_RATING_MAX))}`,
        ),
      index('idx_patient_reviews_appointment_id')
        .on(table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      index('idx_patient_reviews_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_patient_reviews_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patient_reviews_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check(
        'chk_patient_reviews_source',
        sql`${table.source} IN (${literalList(PATIENT_REVIEW_SOURCE_VALUES)})`,
      ),
      check('chk_patient_reviews_rating', sql`${table.rating} BETWEEN 1 AND 5`),
      check('chk_patient_reviews_link', sql`${table.link} ~ '^https://'`),
      check(
        'chk_patient_reviews_file_keys',
        sql`cardinality(${table.file_keys}) <= ${sql.raw(String(PATIENT_REVIEW_FILE_KEYS_MAX))}`,
      ),
      check('chk_patient_reviews_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patient_reviews_delete_reason',
        sql`${table.delete_reason} IN (${literalList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patient_reviews_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patient_reviews_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('patient_reviews_tenant_isolation', {
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
