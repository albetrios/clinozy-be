import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  foreignKey,
  index,
  numeric,
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
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  PATIENT_OFFERING_SUGGESTION_QUANTITY_MAX,
  PATIENT_OFFERING_SUGGESTION_STATUS,
  PATIENT_OFFERING_SUGGESTION_STATUS_VALUES,
} from '@/domains/app/sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.constants.js';

/**
 * Drizzle table for `app.patient_offering_suggestions` — the patient's plan: an offering the team
 * suggests, its quantity, price and status (launch ROUTE #135, routes-final 7.M).
 *
 * @remarks
 * - **Notes:** where it came from is a real link — the visit or the check-in (PK8, TR10); who
 *   suggested it a K8 composite key `RESTRICT` (K2); `source_label` and the never-written
 *   `invoice_links` went (PK7, PK8) — what was invoiced is read from sub-domain 8's invoice lines.
 *   The duplicate-check index serves PK9; the patient and the offering `ON DELETE RESTRICT`. RLS on
 *   the organization GUC with the retention-cleanup arm for the purge; not branch-scoped.
 */
export const patient_offering_suggestions = appSchema
  .table(
    'patient_offering_suggestions',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      patient_id: bigint('patient_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => patients.id, { onDelete: 'restrict' }),
      offering_id: bigint('offering_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => offerings.id, { onDelete: 'restrict' }),
      quantity: smallint('quantity').notNull().default(1),
      // The line's final amount for the whole quantity; none = the billed price × quantity (PK9)
      price: numeric('price', { precision: 12, scale: 2 }),
      status: varchar('status', { length: 9 }).notNull().default('planned'),
      reason: varchar('reason', { length: 200 }),
      // Planned at a visit (PK8)
      appointment_id: bigint('appointment_id', { mode: 'number' }).references(
        (): AnyPgColumn => appointments.id,
        { onDelete: 'set null' },
      ),
      // A check-in's next offering (TR10, PK8)
      patient_check_in_id: bigint('patient_check_in_id', { mode: 'number' }).references(
        (): AnyPgColumn => patient_check_ins.id,
        { onDelete: 'set null' },
      ),
      // The caller (the design's "by")
      suggested_by_membership_id: bigint('suggested_by_membership_id', { mode: 'number' }),
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
      index('idx_patient_offering_suggestions_organization_id').on(table.organization_id),
      uniqueIndex('idx_patient_offering_suggestions_public_id').on(table.public_id),
      // The plan, newest first
      index('idx_patient_offering_suggestions_patient_created').on(
        table.patient_id,
        table.created_at.desc(),
        table.id,
      ),
      // PK9: the duplicate check
      index('idx_patient_offering_suggestions_patient_offering')
        .on(table.patient_id, table.offering_id)
        .where(
          sql`${table.deleted_at} IS NULL AND ${table.status} <> '${sql.raw(PATIENT_OFFERING_SUGGESTION_STATUS.DECLINED)}'`,
        ),
      // "Plan ready" at a visit
      index('idx_patient_offering_suggestions_appointment_id')
        .on(table.appointment_id)
        .where(sql`${table.appointment_id} IS NOT NULL`),
      index('idx_patient_offering_suggestions_patient_check_in_id')
        .on(table.patient_check_in_id)
        .where(sql`${table.patient_check_in_id} IS NOT NULL`),
      index('idx_patient_offering_suggestions_offering_id').on(table.offering_id),
      index('idx_patient_offering_suggestions_suggested_by')
        .on(table.organization_id, table.suggested_by_membership_id)
        .where(sql`${table.suggested_by_membership_id} IS NOT NULL`),
      index('idx_patient_offering_suggestions_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_patient_offering_suggestions_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patient_offering_suggestions_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      // K8: a member of this organization, kept when they leave (K2)
      foreignKey({
        name: 'patient_offering_suggestions_suggested_by_membership_fk',
        columns: [table.organization_id, table.suggested_by_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      check(
        'chk_patient_offering_suggestions_quantity',
        sql`${table.quantity} BETWEEN 1 AND ${sql.raw(String(PATIENT_OFFERING_SUGGESTION_QUANTITY_MAX))}`,
      ),
      check('chk_patient_offering_suggestions_price', sql`${table.price} >= 0`),
      check(
        'chk_patient_offering_suggestions_status',
        sql`${table.status} IN (${sqlLiteralList(PATIENT_OFFERING_SUGGESTION_STATUS_VALUES)})`,
      ),
      check(
        'chk_patient_offering_suggestions_updated',
        sql`${table.updated_at} >= ${table.created_at}`,
      ),
      check(
        'chk_patient_offering_suggestions_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patient_offering_suggestions_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patient_offering_suggestions_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('patient_offering_suggestions_tenant_isolation', {
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
