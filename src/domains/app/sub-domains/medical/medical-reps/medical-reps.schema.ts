import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  date,
  index,
  pgPolicy,
  primaryKey,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteral, sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { manufacturers } from '@/domains/app/sub-domains/medical/manufacturers/manufacturers.schema.js';
import {
  PHONE_NUMBER_PATTERN,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';

/** The organization GUC's row, for a policy. */
const ACTIVE_ORGANIZATION = sql`(
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`;

/**
 * Drizzle table for `app.medical_reps` — a medical representative and their next visit (launch
 * ROUTE #153, routes-final 11.F).
 *
 * @remarks
 * - **Notes:** names are not unique; `phone` is `+91` and ten digits; `next_visit_on` opens the
 *   `medical_rep_visit` task on its day (MD8, MD17) — the reminder index serves the rules worker.
 *   Their visits and links go with them. RLS on the organization GUC with the retention-cleanup
 *   arm for the purge; no branch.
 */
export const medical_reps = appSchema
  .table(
    'medical_reps',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      name: varchar('name', { length: 120 }).notNull(),
      phone: varchar('phone', { length: 13 }),
      next_visit_on: date('next_visit_on', { mode: 'string' }),
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
      uniqueIndex('idx_medical_reps_public_id').on(table.public_id),
      index('idx_medical_reps_organization_name')
        .on(table.organization_id, table.name, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_medical_reps_organization_created').on(
        table.organization_id,
        table.created_at,
        table.id,
      ),
      // The MR visit reminder (MD8)
      index('idx_medical_reps_organization_next_visit')
        .on(table.organization_id, table.next_visit_on)
        .where(sql`${table.deleted_at} IS NULL AND ${table.next_visit_on} IS NOT NULL`),
      index('idx_medical_reps_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_medical_reps_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_medical_reps_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_medical_reps_name', sql`char_length(${table.name}) > 0`),
      check('chk_medical_reps_phone', sql`${table.phone} ~ ${sqlLiteral(PHONE_NUMBER_PATTERN)}`),
      check('chk_medical_reps_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_medical_reps_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_medical_reps_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_medical_reps_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('medical_reps_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}
          OR ${maintenanceBypassArm('app.global_retention_cleanup')}`,
        withCheck: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
      }),
    ],
  )
  .enableRLS();

/**
 * Drizzle link table `app.medical_rep_manufacturers` — which brands an MR represents (launch
 * ROUTE #153, MD9, MD17): written by the MR's `manufacturer_ids` and the manufacturer's
 * `medical_rep_ids`. One row per pair; removing either side removes the row. RLS on the
 * organization GUC.
 */
export const medical_rep_manufacturers = appSchema
  .table(
    'medical_rep_manufacturers',
    {
      medical_rep_id: bigint('medical_rep_id', { mode: 'number' })
        .notNull()
        .references(() => medical_reps.id, { onDelete: 'cascade' }),
      manufacturer_id: bigint('manufacturer_id', { mode: 'number' })
        .notNull()
        .references(() => manufacturers.id, { onDelete: 'cascade' }),
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
        name: 'medical_rep_manufacturers_pkey',
        columns: [table.medical_rep_id, table.manufacturer_id],
      }),
      index('idx_medical_rep_manufacturers_manufacturer_id').on(table.manufacturer_id),
      index('idx_medical_rep_manufacturers_organization_id').on(table.organization_id),
      index('idx_medical_rep_manufacturers_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      pgPolicy('medical_rep_manufacturers_tenant_isolation', {
        as: 'permissive',
        for: 'all',
        to: 'public',
        using: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
        withCheck: sql`${table.organization_id} = ${ACTIVE_ORGANIZATION}`,
      }),
    ],
  )
  .enableRLS();
