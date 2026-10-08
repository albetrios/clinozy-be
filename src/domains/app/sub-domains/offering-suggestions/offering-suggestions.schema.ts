import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
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
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import { OFFERING_SUGGESTION_STATUS_VALUES } from '@/domains/app/sub-domains/offering-suggestions/offering-suggestions.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.offering_suggestions` — An offering suggested to a patient — the plan card (launch ROUTE #32, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `offering_suggestions_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const offering_suggestions = appSchema
  .table(
    'offering_suggestions',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      patient_id: bigint('patient_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => patients.id, { onDelete: 'no action' }),
      offering_id: bigint('offering_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => offerings.id, { onDelete: 'no action' }),
      quantity: integer('quantity').notNull().default(1),
      // The line's final price; null = list price
      price: numeric('price', { precision: 12, scale: 2 }),
      status: varchar('status', { length: 9 }).notNull().default('planned'),
      source_label: varchar('source_label', { length: 80 }).notNull(),
      appointment_id: bigint('appointment_id', { mode: 'number' }).references(
        (): AnyPgColumn => appointments.id,
        { onDelete: 'set null' },
      ),
      reason: varchar('reason', { length: 200 }),
      // A check-in's next offering (TR10, PK8)
      patient_check_in_id: bigint('patient_check_in_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_check_ins.id,
        { onDelete: 'set null' },
      ),
      // { invoice_id, invoice_line_index, quantity } — written when an invoice is linked
      invoice_links: jsonb('invoice_links').notNull().default([]),
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
      uniqueIndex('idx_offering_suggestions_public_id').on(table.public_id),
      index('idx_offering_suggestions_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      index('idx_offering_suggestions_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_offering_suggestions_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_offering_suggestions_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_offering_suggestions_patient_created').on(
        table.patient_id,
        table.created_at,
        table.id,
      ),
      index('idx_offering_suggestions_offering_id').on(table.offering_id),
      index('idx_offering_suggestions_appointment_id')
        .on(table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      index('idx_offering_suggestions_patient_check_in_id')
        .on(table.patient_check_in_id)
        .where(sql`${table.patient_check_in_id} IS NOT NULL`),
      check('chk_offering_suggestions_quantity', sql`${table.quantity} BETWEEN 1 AND 99`),
      check('chk_offering_suggestions_price', sql`${table.price} >= 0`),
      check(
        'chk_offering_suggestions_status',
        sql`${table.status} IN (${joinValues(OFFERING_SUGGESTION_STATUS_VALUES)})`,
      ),
      check('chk_offering_suggestions_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_offering_suggestions_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_offering_suggestions_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_offering_suggestions_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('offering_suggestions_tenant_isolation', {
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
