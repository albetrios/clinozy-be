import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
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
import { patient_diagnoses } from '@/domains/app/sub-domains/patients/patient-diagnoses/patient-diagnoses.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  PATIENT_CLINICAL_NOTE_KIND,
  PATIENT_CLINICAL_NOTE_KIND_VALUES,
} from '@/domains/app/sub-domains/patients/patient-clinical-notes/patient-clinical-notes.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` or `ARRAY[…]` CHECK. */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/**
 * Drizzle table for `app.patient_clinical_notes` — one clinical note on a patient file: a
 * complaint, finding, diagnosis, suggestion or safety check (launch ROUTE #133, routes-final 7.B).
 *
 * @remarks
 * - **Notes:** never edited — a wrong note is deleted with a reason and written again (P12); the
 *   visit's consult notes live here (`appointment_id`, A10); a `diagnosis` note may point at the
 *   catalogue (`chk_patient_clinical_notes_patient_diagnosis`). The patient `ON DELETE RESTRICT`
 *   (P7). RLS on the organization GUC with the retention-cleanup arm for the deleted-record purge.
 */
export const patient_clinical_notes = appSchema
  .table(
    'patient_clinical_notes',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      patient_id: bigint('patient_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => patients.id, { onDelete: 'restrict' }),
      kind: varchar('kind', { length: 20 }).notNull(),
      text: varchar('text', { length: 500 }).notNull(),
      // The visit the note was taken at (A10)
      appointment_id: bigint('appointment_id', { mode: 'number' }).references(
        (): AnyPgColumn => appointments.id,
        { onDelete: 'set null' },
      ),
      // A `diagnosis` note's catalogue entry (P12)
      patient_diagnosis_id: bigint('patient_diagnosis_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_diagnoses.id,
        { onDelete: 'set null' },
      ),
      added_at: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
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
      uniqueIndex('idx_patient_clinical_notes_public_id').on(table.public_id),
      index('idx_patient_clinical_notes_patient_kind_created').on(
        table.patient_id,
        table.kind,
        table.created_at,
      ),
      index('idx_patient_clinical_notes_patient_created')
        .on(table.patient_id, table.created_at.desc(), table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_patient_clinical_notes_appointment_id')
        .on(table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      index('idx_patient_clinical_notes_patient_diagnosis_id')
        .on(table.patient_diagnosis_id)
        .where(sql`${table.patient_diagnosis_id} IS NOT NULL`),
      index('idx_patient_clinical_notes_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_patient_clinical_notes_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patient_clinical_notes_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check(
        'chk_patient_clinical_notes_kind',
        sql`${table.kind} IN (${literalList(PATIENT_CLINICAL_NOTE_KIND_VALUES)})`,
      ),
      check('chk_patient_clinical_notes_text', sql`char_length(${table.text}) > 0`),
      check(
        'chk_patient_clinical_notes_patient_diagnosis',
        sql`${table.patient_diagnosis_id} IS NULL OR ${table.kind} = '${sql.raw(PATIENT_CLINICAL_NOTE_KIND.DIAGNOSIS)}'`,
      ),
      check('chk_patient_clinical_notes_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patient_clinical_notes_delete_reason',
        sql`${table.delete_reason} IN (${literalList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patient_clinical_notes_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patient_clinical_notes_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('patient_clinical_notes_tenant_isolation', {
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
