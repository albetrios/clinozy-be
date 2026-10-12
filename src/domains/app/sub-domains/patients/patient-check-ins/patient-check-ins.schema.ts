import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  date,
  index,
  pgPolicy,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  PATIENT_CHECK_IN_ACTION_SCORE_MAX,
  PATIENT_CHECK_IN_FEEL,
  PATIENT_CHECK_IN_FEEL_VALUES,
  PATIENT_CHECK_IN_FOLLOWED_VALUES,
} from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.constants.js';

/**
 * Drizzle table for `app.patient_check_ins` — how a patient is doing after a visit or a session
 * (launch ROUTE #134, routes-final 7.I).
 *
 * @remarks
 * - **Notes:** `context` is server-filled when not sent (TR9); the next offerings live in the plan
 *   (`patient_offering_suggestions.patient_check_in_id`, TR10 — `app.check_in_next_offerings`
 *   went); the call-back index serves sub-domain 10's rule (feel `worse` or a score ≤ 4). The patient
 *   `ON DELETE RESTRICT` (P7). RLS on the organization GUC with the retention-cleanup arm for the
 *   deleted-record purge; not branch-scoped (TR3).
 */
export const patient_check_ins = appSchema
  .table(
    'patient_check_ins',
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
      patient_treatment_id: bigint('patient_treatment_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_treatments.id,
        { onDelete: 'set null' },
      ),
      // "After <treatment>" or "Visit · <date>" when not sent (TR9)
      context: varchar('context', { length: 80 }).notNull(),
      feel: varchar('feel', { length: 11 }).notNull(),
      score: smallint('score').notNull(),
      followed: varchar('followed', { length: 10 }),
      followed_note: varchar('followed_note', { length: 280 }),
      current_state: varchar('current_state', { length: 500 }),
      next_plan: varchar('next_plan', { length: 500 }),
      check_in_date: date('check_in_date', { mode: 'string' }).notNull(),
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
      index('idx_patient_check_ins_organization_id').on(table.organization_id),
      uniqueIndex('idx_patient_check_ins_public_id').on(table.public_id),
      // The card, and the previous score
      index('idx_patient_check_ins_patient_date').on(
        table.patient_id,
        table.check_in_date,
        table.id,
      ),
      // A treatment's latest check-in
      index('idx_patient_check_ins_patient_treatment_date')
        .on(table.patient_treatment_id, table.check_in_date)
        .where(sql`${table.patient_treatment_id} IS NOT NULL`),
      // Sub-domain 10's call-back rule
      index('idx_patient_check_ins_organization_needs_call')
        .on(table.organization_id, table.created_at)
        .where(
          sql`${table.deleted_at} IS NULL AND (${table.feel} = '${sql.raw(PATIENT_CHECK_IN_FEEL.WORSE)}' OR ${table.score} <= ${sql.raw(String(PATIENT_CHECK_IN_ACTION_SCORE_MAX))})`,
        ),
      index('idx_patient_check_ins_appointment_id')
        .on(table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      index('idx_patient_check_ins_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_patient_check_ins_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patient_check_ins_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_patient_check_ins_context', sql`char_length(${table.context}) > 0`),
      check(
        'chk_patient_check_ins_feel',
        sql`${table.feel} IN (${sqlLiteralList(PATIENT_CHECK_IN_FEEL_VALUES)})`,
      ),
      check('chk_patient_check_ins_score', sql`${table.score} BETWEEN 1 AND 10`),
      check(
        'chk_patient_check_ins_followed',
        sql`${table.followed} IN (${sqlLiteralList(PATIENT_CHECK_IN_FOLLOWED_VALUES)})`,
      ),
      check('chk_patient_check_ins_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patient_check_ins_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patient_check_ins_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patient_check_ins_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('patient_check_ins_tenant_isolation', {
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
