import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  foreignKey,
  index,
  jsonb,
  pgPolicy,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import { PATIENT_PRESCRIPTION_ITEMS_MAX } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.constants.js';

/**
 * Drizzle table for `app.prescription_kits` — a doctor's own reusable prescription lines, copied
 * into a draft by the screen (launch ROUTE #133, routes-final 7.D).
 *
 * @remarks
 * - **Notes:** the owner is an explicit K8 composite key that goes with its membership (`CASCADE`,
 *   P17); names unique per owner in any case among live kits; the lines carry the prescription's
 *   checks (P16). RLS on the organization GUC with the retention-cleanup arm for the deleted-record
 *   purge.
 */
export const prescription_kits = appSchema
  .table(
    'prescription_kits',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      // The doctor whose kit it is (P17)
      owner_membership_id: bigint('owner_membership_id', { mode: 'number' }).notNull(),
      name: varchar('name', { length: 80 }).notNull(),
      items: jsonb('items').notNull().default([]),
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
      index('idx_prescription_kits_organization_owner').on(
        table.organization_id,
        table.owner_membership_id,
      ),
      uniqueIndex('idx_prescription_kits_public_id').on(table.public_id),
      // P17: one live kit of a name per owner, in any case
      uniqueIndex('idx_prescription_kits_owner_name_unique')
        .on(table.organization_id, table.owner_membership_id, sql`lower(${table.name})`)
        .where(sql`${table.deleted_at} IS NULL`),
      index('idx_prescription_kits_owner_created').on(
        table.owner_membership_id,
        table.created_at.desc(),
      ),
      index('idx_prescription_kits_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_prescription_kits_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_prescription_kits_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      // K8: a member of this organization; the kit goes with them (P17)
      foreignKey({
        name: 'prescription_kits_owner_membership_fk',
        columns: [table.organization_id, table.owner_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('cascade'),
      check(
        'chk_prescription_kits_items',
        sql`jsonb_typeof(${table.items}) = 'array' AND jsonb_array_length(${table.items}) <= ${sql.raw(String(PATIENT_PRESCRIPTION_ITEMS_MAX))}`,
      ),
      check('chk_prescription_kits_name', sql`char_length(${table.name}) > 0`),
      check('chk_prescription_kits_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_prescription_kits_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_prescription_kits_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_prescription_kits_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('prescription_kits_tenant_isolation', {
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
