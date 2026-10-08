import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  date,
  index,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { treatments } from '@/domains/app/sub-domains/treatments/treatments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import { PATIENT_BODY_PART_VALUES } from '@/domains/app/sub-domains/patients/patients.constants.js';
import {
  PATIENT_IMAGE_ALBUM_VALUES,
  PATIENT_IMAGE_STAGE_VALUES,
} from '@/domains/app/sub-domains/patients/patient-images/patient-images.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` or `ARRAY[…]` CHECK. */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/**
 * Drizzle table for `app.patient_images` — a photo of a patient in one of three albums, optionally
 * filed under its visit, its session and a stage (launch ROUTE #133, routes-final 7.F).
 *
 * @remarks
 * - **Notes:** the album is a column, not three tables (P23 — the private album is an application
 *   rule, not RLS); an upload is filed once (`idx_patient_images_organization_file_key`, P25); the
 *   body part from the patient file's one list (TR8). The patient `ON DELETE RESTRICT` (P7). RLS on
 *   the organization GUC with the retention-cleanup arm for the deleted-record purge.
 */
export const patient_images = appSchema
  .table(
    'patient_images',
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
      // The session it was taken at (P24)
      patient_treatment_id: bigint('patient_treatment_id', { mode: 'number' }).references(
        (): AnyPgColumn => treatments.id,
        { onDelete: 'set null' },
      ),
      album: varchar('album', { length: 7 }).notNull().default('general'),
      stage: varchar('stage', { length: 6 }),
      // The confirmed upload's object key
      file_key: varchar('file_key', { length: 512 }).notNull(),
      // From the upload (P25)
      file_name: varchar('file_name', { length: 120 }).notNull(),
      // The drawer's Name
      display_name: varchar('display_name', { length: 60 }),
      caption: varchar('caption', { length: 200 }),
      body_part: varchar('body_part', { length: 9 }),
      taken_on: date('taken_on', { mode: 'string' }).notNull(),
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
      uniqueIndex('idx_patient_images_public_id').on(table.public_id),
      // Each album tab, newest first, and its count
      index('idx_patient_images_patient_album_taken_on')
        .on(table.patient_id, table.album, table.taken_on.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      // P25: an upload is filed once
      uniqueIndex('idx_patient_images_organization_file_key').on(
        table.organization_id,
        table.file_key,
      ),
      index('idx_patient_images_appointment_id')
        .on(table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      index('idx_patient_images_patient_treatment_id')
        .on(table.patient_treatment_id)
        .where(sql`${table.patient_treatment_id} IS NOT NULL`),
      index('idx_patient_images_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_patient_images_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patient_images_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check(
        'chk_patient_images_album',
        sql`${table.album} IN (${literalList(PATIENT_IMAGE_ALBUM_VALUES)})`,
      ),
      check(
        'chk_patient_images_stage',
        sql`${table.stage} IN (${literalList(PATIENT_IMAGE_STAGE_VALUES)})`,
      ),
      check(
        'chk_patient_images_body_part',
        sql`${table.body_part} IN (${literalList(PATIENT_BODY_PART_VALUES)})`,
      ),
      check('chk_patient_images_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patient_images_delete_reason',
        sql`${table.delete_reason} IN (${literalList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patient_images_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patient_images_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('patient_images_tenant_isolation', {
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
