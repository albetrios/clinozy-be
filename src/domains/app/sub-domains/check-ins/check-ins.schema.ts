import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  date,
  index,
  integer,
  pgPolicy,
  primaryKey,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { treatments } from '@/domains/app/sub-domains/treatments/treatments.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  CHECK_IN_FEEL_VALUES,
  CHECK_IN_FOLLOWED_VALUES,
} from '@/domains/app/sub-domains/check-ins/check-ins.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.check_ins` — A follow-up check on how a patient is doing (launch ROUTE #41, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `check_ins_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const check_ins = appSchema
  .table(
    'check_ins',
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
      treatment_id: bigint('treatment_id', { mode: 'number' }).references(
        (): AnyPgColumn => treatments.id,
        { onDelete: 'set null' },
      ),
      context: varchar('context', { length: 80 }).notNull(),
      feel: varchar('feel', { length: 11 }).notNull(),
      score: integer('score').notNull(),
      followed: varchar('followed', { length: 10 }),
      followed_note: varchar('followed_note', { length: 280 }),
      // How it is now
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
      uniqueIndex('idx_check_ins_public_id').on(table.public_id),
      index('idx_check_ins_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_check_ins_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_check_ins_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_check_ins_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_check_ins_patient_created').on(table.patient_id, table.created_at, table.id),
      index('idx_check_ins_appointment_id')
        .on(table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      index('idx_check_ins_treatment_id')
        .on(table.treatment_id)
        .where(sql`${table.treatment_id} IS NOT NULL`),
      index('idx_check_ins_organization_check_in_date')
        .on(table.organization_id, table.check_in_date, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      check('chk_check_ins_feel', sql`${table.feel} IN (${joinValues(CHECK_IN_FEEL_VALUES)})`),
      check('chk_check_ins_score', sql`${table.score} BETWEEN 1 AND 10`),
      check(
        'chk_check_ins_followed',
        sql`${table.followed} IN (${joinValues(CHECK_IN_FOLLOWED_VALUES)})`,
      ),
      check('chk_check_ins_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_check_ins_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_check_ins_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_check_ins_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('check_ins_tenant_isolation', {
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
 * Drizzle link table `app.check_in_next_offerings` — the `next_offering_ids` of an check in (launch ROUTE #41).
 * One row per pair; removing either side removes the row. RLS on the organization GUC.
 */
export const check_in_next_offerings = appSchema
  .table(
    'check_in_next_offerings',
    {
      check_in_id: bigint('check_in_id', { mode: 'number' })
        .notNull()
        .references(() => check_ins.id, { onDelete: 'cascade' }),
      next_offering_id: bigint('next_offering_id', { mode: 'number' })
        .notNull()
        .references(() => offerings.id, { onDelete: 'cascade' }),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      primaryKey({
        name: 'check_in_next_offerings_pkey',
        columns: [table.check_in_id, table.next_offering_id],
      }),
      index('idx_check_in_next_offerings_next_offering_id').on(table.next_offering_id),
      index('idx_check_in_next_offerings_organization_id').on(table.organization_id),
      index('idx_check_in_next_offerings_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('check_in_next_offerings_tenant_isolation', {
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
