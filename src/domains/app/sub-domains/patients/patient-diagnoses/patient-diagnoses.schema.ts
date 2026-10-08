import { sql, type SQL } from 'drizzle-orm';
import {
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
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';

/** `'a', 'b', …` — a value list as SQL literals, for an `IN (…)` or `ARRAY[…]` CHECK. */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/**
 * Drizzle table for `app.patient_diagnoses` — the organization's diagnosis catalogue a clinical
 * note of kind `diagnosis` picks from (launch ROUTE #133, routes-final 7.E).
 *
 * @remarks
 * - **Notes:** a catalogue — no `patient_id` (P28); names unique in the organization in any case
 *   among live entries (P18). RLS on the organization GUC with the retention-cleanup arm for the
 *   deleted-record purge.
 */
export const patient_diagnoses = appSchema
  .table(
    'patient_diagnoses',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      name: varchar('name', { length: 120 }).notNull(),
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
      uniqueIndex('idx_patient_diagnoses_public_id').on(table.public_id),
      // P18: one live entry of a name, in any case
      uniqueIndex('idx_patient_diagnoses_organization_name_unique')
        .on(table.organization_id, sql`lower(${table.name})`)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_patient_diagnoses_organization_name').on(
        table.organization_id,
        table.name,
        table.id,
      ),
      index('idx_patient_diagnoses_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_patient_diagnoses_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_patient_diagnoses_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check('chk_patient_diagnoses_name', sql`char_length(${table.name}) > 0`),
      check('chk_patient_diagnoses_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_patient_diagnoses_delete_reason',
        sql`${table.delete_reason} IN (${literalList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_patient_diagnoses_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_patient_diagnoses_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('patient_diagnoses_tenant_isolation', {
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
