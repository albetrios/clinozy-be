import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  foreignKey,
  index,
  jsonb,
  pgPolicy,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema } from '@/infrastructure/database/pg-schemas.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patient_packages } from '@/domains/app/sub-domains/patient-packages/patient-packages.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { PATIENT_BODY_PART_VALUES } from '@/domains/app/sub-domains/patients/patients.constants.js';
import {
  PATIENT_TREATMENT_AFTERCARE_CALL_VALUES,
  PATIENT_TREATMENT_BODY_PARTS_MAX,
  PATIENT_TREATMENT_SESSION_MAX,
  PATIENT_TREATMENT_STATUS,
  PATIENT_TREATMENT_STATUS_VALUES,
  PATIENT_TREATMENT_TEMPLATE_VALUES,
} from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` or `ARRAY[…]` CHECK. */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/** A literal number in a CHECK. */
function literalNumber(value: number): SQL {
  return sql.raw(String(value));
}

/** `'done'` / `'reversed'` as SQL literals. */
const DONE = sql.raw(`'${PATIENT_TREATMENT_STATUS.DONE}'`);
const REVERSED = sql.raw(`'${PATIENT_TREATMENT_STATUS.REVERSED}'`);

/**
 * Drizzle table for `app.patient_treatments` — one session recorded for a patient, reversed with a
 * reason, never deleted (launch ROUTE #134, routes-final 7.H).
 *
 * @remarks
 * - **Notes:** no soft-delete columns (TR6) — out of the purge list; `patient_offering_id` is the
 *   bought session it spent (TR7, TR13), kept while done (`RESTRICT`) and cleared on reverse
 *   (`chk_patient_treatments_patient_offering_done`); `session_number` 1–999; the body parts from
 *   the patient file's one list, up to 12 (TR8); the doctor and therapist K8 composite keys
 *   `RESTRICT` (K2). The not-billed index serves `is_billed=false` (TR13). RLS on the organization
 *   GUC; not branch-scoped (TR3).
 */
export const patient_treatments = appSchema
  .table(
    'patient_treatments',
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
      offering_id: bigint('offering_id', { mode: 'number' }).references(
        (): AnyPgColumn => offerings.id,
        { onDelete: 'set null' },
      ),
      name: varchar('name', { length: 120 }).notNull(),
      template: varchar('template', { length: 7 }).notNull().default('skin'),
      performed_at: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
      doctor_membership_id: bigint('doctor_membership_id', { mode: 'number' }),
      therapist_membership_id: bigint('therapist_membership_id', { mode: 'number' }),
      body_parts: text('body_parts').array().notNull().default([]),
      session_number: smallint('session_number').notNull().default(1),
      // The template's detail (teeth, regions — TR8)
      parameters: jsonb('parameters').notNull().default({}),
      remark: varchar('remark', { length: 2000 }),
      aftercare_call: varchar('aftercare_call', { length: 11 }).notNull().default('next_day'),
      // The bought session it spent (TR7, TR13)
      patient_offering_id: bigint('patient_offering_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_packages.id,
        { onDelete: 'restrict' },
      ),
      status: varchar('status', { length: 8 }).notNull().default('done'),
      reversed_reason: varchar('reversed_reason', { length: 280 }),
      reversed_at: timestamp('reversed_at', { withTimezone: true }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
      updated_by_user_id: bigint('updated_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      uniqueIndex('idx_patient_treatments_public_id').on(table.public_id),
      // The patient's tab, newest first
      index('idx_patient_treatments_patient_performed').on(
        table.patient_id,
        table.performed_at.desc(),
        table.id,
      ),
      // The organization list
      index('idx_patient_treatments_organization_performed').on(
        table.organization_id,
        table.performed_at.desc(),
        table.id,
      ),
      // TR13: done, with an offering, not billed
      index('idx_patient_treatments_organization_not_billed')
        .on(table.organization_id, table.performed_at.desc(), table.id)
        .where(
          sql`${table.status} = ${DONE} AND ${table.offering_id} IS NOT NULL AND ${table.patient_offering_id} IS NULL`,
        ),
      index('idx_patient_treatments_patient_offering_id')
        .on(table.patient_offering_id)
        .where(sql`${table.patient_offering_id} IS NOT NULL`),
      index('idx_patient_treatments_appointment_id')
        .on(table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      index('idx_patient_treatments_offering_id')
        .on(table.offering_id)
        .where(sql`${table.offering_id} IS NOT NULL`),
      index('idx_patient_treatments_doctor_performed')
        .on(table.organization_id, table.doctor_membership_id, table.performed_at)
        .where(sql`${table.doctor_membership_id} IS NOT NULL`),
      index('idx_patient_treatments_therapist_performed')
        .on(table.organization_id, table.therapist_membership_id, table.performed_at)
        .where(sql`${table.therapist_membership_id} IS NOT NULL`),
      index('idx_patient_treatments_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patient_treatments_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      // K8: members of this organization, kept when they leave (K2)
      foreignKey({
        name: 'patient_treatments_doctor_membership_fk',
        columns: [table.organization_id, table.doctor_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      foreignKey({
        name: 'patient_treatments_therapist_membership_fk',
        columns: [table.organization_id, table.therapist_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      check('chk_patient_treatments_name', sql`char_length(${table.name}) > 0`),
      check(
        'chk_patient_treatments_template',
        sql`${table.template} IN (${literalList(PATIENT_TREATMENT_TEMPLATE_VALUES)})`,
      ),
      check(
        'chk_patient_treatments_body_parts',
        sql`${table.body_parts} <@ ARRAY[${literalList(PATIENT_BODY_PART_VALUES)}]::text[] AND cardinality(${table.body_parts}) <= ${literalNumber(PATIENT_TREATMENT_BODY_PARTS_MAX)}`,
      ),
      check(
        'chk_patient_treatments_session_number',
        sql`${table.session_number} BETWEEN 1 AND ${literalNumber(PATIENT_TREATMENT_SESSION_MAX)}`,
      ),
      check('chk_patient_treatments_parameters', sql`jsonb_typeof(${table.parameters}) = 'object'`),
      check(
        'chk_patient_treatments_aftercare_call',
        sql`${table.aftercare_call} IN (${literalList(PATIENT_TREATMENT_AFTERCARE_CALL_VALUES)})`,
      ),
      check(
        'chk_patient_treatments_status',
        sql`${table.status} IN (${literalList(PATIENT_TREATMENT_STATUS_VALUES)})`,
      ),
      // TR7, TR6: a spent session is held while done, given back on reverse
      check(
        'chk_patient_treatments_patient_offering_done',
        sql`${table.status} = ${DONE} OR ${table.patient_offering_id} IS NULL`,
      ),
      check(
        'chk_patient_treatments_reversed_reason',
        sql`(${table.status} = ${REVERSED}) = (${table.reversed_reason} IS NOT NULL)`,
      ),
      check(
        'chk_patient_treatments_reversed_at',
        sql`(${table.status} = ${REVERSED}) = (${table.reversed_at} IS NOT NULL)`,
      ),
      check('chk_patient_treatments_updated', sql`${table.updated_at} >= ${table.created_at}`),
      pgPolicy('patient_treatments_tenant_isolation', {
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
