import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  index,
  pgPolicy,
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
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import { VISIT_STAGE_VALUES } from '@/domains/app/sub-domains/visits/visits.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.visits` — One visit in progress — the floor stage, the consult note and the safety checks (frontend D18) (launch ROUTE #22, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `visits_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const visits = appSchema
  .table(
    'visits',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      appointment_id: bigint('appointment_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => appointments.id, { onDelete: 'no action' }),
      patient_id: bigint('patient_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => patients.id, { onDelete: 'no action' }),
      stage: varchar('stage', { length: 11 }).notNull().default('waiting'),
      stage_changed_at: timestamp('stage_changed_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
      started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
      paused_at: timestamp('paused_at', { withTimezone: true }),
      completed_at: timestamp('completed_at', { withTimezone: true }),
      last_saved_at: timestamp('last_saved_at', { withTimezone: true }),
      consult_complaint: text('consult_complaint'),
      consult_findings: text('consult_findings'),
      consult_plan: text('consult_plan'),
      diagnoses: text('diagnoses').array().notNull().default([]),
      is_safety_consent_checked: boolean('is_safety_consent_checked').notNull().default(false),
      is_safety_before_photos_taken: boolean('is_safety_before_photos_taken')
        .notNull()
        .default(false),
      is_safety_allergies_checked: boolean('is_safety_allergies_checked').notNull().default(false),
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
      uniqueIndex('idx_visits_public_id').on(table.public_id),
      index('idx_visits_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_visits_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_visits_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_visits_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_visits_appointment_id').on(table.appointment_id),
      index('idx_visits_patient_id').on(table.patient_id),
      uniqueIndex('idx_visits_appointment_unique')
        .on(table.organization_id, table.appointment_id)
        .where(sql`${table.deleted_at} IS NULL`),
      check('chk_visits_stage', sql`${table.stage} IN (${joinValues(VISIT_STAGE_VALUES)})`),
      check('chk_visits_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_visits_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_visits_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_visits_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('visits_tenant_isolation', {
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
