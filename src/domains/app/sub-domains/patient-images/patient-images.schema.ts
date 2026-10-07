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
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  PATIENT_IMAGE_ALBUM_VALUES,
  PATIENT_IMAGE_BODY_PART_VALUES,
} from '@/domains/app/sub-domains/patient-images/patient-images.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.patient_images` — A clinical photo of a patient (the Private album is Doctor and Admin only) (launch ROUTE #27, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `patient_images_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
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
        .references((): AnyPgColumn => patients.id, { onDelete: 'no action' }),
      appointment_id: bigint('appointment_id', { mode: 'number' }).references(
        (): AnyPgColumn => appointments.id,
        { onDelete: 'set null' },
      ),
      album: varchar('album', { length: 7 }).notNull().default('general'),
      // The confirmed upload's object key
      file_key: varchar('file_key', { length: 512 }).notNull(),
      file_name: varchar('file_name', { length: 120 }).notNull(),
      body_part: varchar('body_part', { length: 8 }),
      taken_on: date('taken_on', { mode: 'string' }).notNull(),
      caption: varchar('caption', { length: 200 }),
      // An editable display name (P45)
      display_name: varchar('display_name', { length: 60 }),
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
      index('idx_patient_images_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_patient_images_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_patient_images_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patient_images_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_patient_images_patient_created').on(table.patient_id, table.created_at, table.id),
      index('idx_patient_images_appointment_id')
        .on(table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      index('idx_patient_images_organization_taken_on')
        .on(table.organization_id, table.taken_on, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      check(
        'chk_patient_images_album',
        sql`${table.album} IN (${joinValues(PATIENT_IMAGE_ALBUM_VALUES)})`,
      ),
      check(
        'chk_patient_images_body_part',
        sql`${table.body_part} IN (${joinValues(PATIENT_IMAGE_BODY_PART_VALUES)})`,
      ),
      check('chk_patient_images_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patient_images_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patient_images_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patient_images_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
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
