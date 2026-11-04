import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  date,
  index,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import { UPLOAD_THUMBNAIL_SKIP_REASON_VALUES } from '@/domains/upload/upload.constants.js';
import { PATIENT_BODY_PART_VALUES } from '@/domains/app/sub-domains/patients/patients.constants.js';
import {
  PATIENT_IMAGE_ALBUM_VALUES,
  PATIENT_IMAGE_STAGE_VALUES,
} from '@/domains/app/sub-domains/patients/patient-images/patient-images.constants.js';

/**
 * Drizzle table for `app.patient_images` — a photo of a patient in one of three albums, optionally
 * filed under its visit, its session and a stage (launch ROUTE #133, routes-final 7.F).
 *
 * @remarks
 * - **Notes:** the album is a column, not three tables (P23 — the private album is an application
 *   rule, not RLS); an upload is filed once (`idx_patient_images_organization_file_key`, P25); the
 *   body part from the patient file's one list (TR8). The patient `ON DELETE RESTRICT` (P7). RLS on
 *   the organization GUC with the retention-cleanup arm for the deleted-record purge and the
 *   thumbnail sweep. `thumbnail_key` is the background thumbnail (feat-patient-image-thumbnails),
 *   null until it exists; `thumbnail_skip_reason` records why the job made none (a final skip — the
 *   sweep and the backfill pass the photo by), never set beside a key.
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
      patient_id: bigint('patient_id', { mode: 'number' }).notNull(),
      appointment_id: bigint('appointment_id', { mode: 'number' }),
      // The session it was taken at (P24)
      patient_treatment_id: bigint('patient_treatment_id', { mode: 'number' }),
      album: varchar('album', { length: 7 }).notNull().default('general'),
      stage: varchar('stage', { length: 6 }),
      // The confirmed upload's object key
      file_key: varchar('file_key', { length: 512 }).notNull(),
      // Its thumbnail's object key — null until the thumbnail job makes one (and after a delete)
      thumbnail_key: varchar('thumbnail_key', { length: 512 }),
      // Why the thumbnail job made none (UPLOAD_THUMBNAIL_SKIP_REASON_VALUES) — null until it skips
      thumbnail_skip_reason: varchar('thumbnail_skip_reason', { length: 20 }),
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
        { onDelete: 'set null' },
      ),
      updated_by_user_id: bigint('updated_by_user_id', { mode: 'number' }).references(
        () => users.id,
        { onDelete: 'set null' },
      ),
      deleted_at: timestamp('deleted_at', { withTimezone: true }),
      delete_reason: varchar('delete_reason', { length: 20 }),
      delete_note: varchar('delete_note', { length: 280 }),
    },
    (table) => [
      // The SQL says ON DELETE SET NULL ("appointment_id"): organization_id is kept.
      foreignKey({
        name: 'patient_images_appointment_fk',
        columns: [table.organization_id, table.appointment_id],
        foreignColumns: [appointments.organization_id, appointments.id],
      }).onDelete('set null'),
      index('idx_patient_images_organization_appointment')
        .on(table.organization_id, table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      foreignKey({
        name: 'patient_images_patient_fk',
        columns: [table.organization_id, table.patient_id],
        foreignColumns: [patients.organization_id, patients.id],
      }).onDelete('restrict'),
      index('idx_patient_images_organization_patient')
        .on(table.organization_id, table.patient_id)
        .where(sql`${table.patient_id} IS NOT NULL`),
      // The SQL says ON DELETE SET NULL ("patient_treatment_id"): organization_id is kept.
      foreignKey({
        name: 'patient_images_patient_treatment_fk',
        columns: [table.organization_id, table.patient_treatment_id],
        foreignColumns: [patient_treatments.organization_id, patient_treatments.id],
      }).onDelete('set null'),
      index('idx_patient_images_organization_patient_treatment')
        .on(table.organization_id, table.patient_treatment_id)
        .where(sql`${table.patient_treatment_id} IS NOT NULL`),
      uniqueIndex('idx_patient_images_public_id').on(table.public_id),
      // Each album tab, newest first, and its count
      index('idx_patient_images_patient_album_taken_on').on(
        table.patient_id,
        table.album,
        table.taken_on,
        table.id,
      ),
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
        sql`${table.album} IN (${sqlLiteralList(PATIENT_IMAGE_ALBUM_VALUES)})`,
      ),
      check(
        'chk_patient_images_stage',
        sql`${table.stage} IN (${sqlLiteralList(PATIENT_IMAGE_STAGE_VALUES)})`,
      ),
      check(
        'chk_patient_images_body_part',
        sql`${table.body_part} IN (${sqlLiteralList(PATIENT_BODY_PART_VALUES)})`,
      ),
      check(
        'chk_patient_images_thumbnail_skip_reason',
        sql`${table.thumbnail_skip_reason} IN (${sqlLiteralList(UPLOAD_THUMBNAIL_SKIP_REASON_VALUES)})`,
      ),
      check(
        'chk_patient_images_thumbnail_or_skip',
        sql`${table.thumbnail_key} IS NULL OR ${table.thumbnail_skip_reason} IS NULL`,
      ),
      check('chk_patient_images_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patient_images_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
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
