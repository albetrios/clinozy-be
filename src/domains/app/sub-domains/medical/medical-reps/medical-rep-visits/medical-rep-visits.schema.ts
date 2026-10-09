import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  date,
  foreignKey,
  index,
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
import { medical_reps } from '@/domains/app/sub-domains/medical/medical-reps/medical-reps.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';

/** The organization GUC's row, for a policy. */
const ACTIVE_ORGANIZATION = sql`(
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`;

/**
 * Drizzle table for `app.medical_rep_visits` — one logged MR visit (launch ROUTE #153,
 * routes-final 11.G, MD18).
 *
 * @remarks
 * - **Notes:** the rep's own (it goes with them); `next_visit_on` is after the visit; who logged it
 *   is K8's composite key (`RESTRICT`, K2). Never changed — deleted and restored with why. RLS on
 *   the organization GUC with the retention-cleanup arm for the purge.
 */
export const medical_rep_visits = appSchema
  .table(
    'medical_rep_visits',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      medical_rep_id: bigint('medical_rep_id', { mode: 'number' })
        .notNull()
        .references(() => medical_reps.id, { onDelete: 'cascade' }),
      visit_date: date('visit_date', { mode: 'string' }).notNull(),
      next_visit_on: date('next_visit_on', { mode: 'string' }),
      samples: varchar('samples', { length: 120 }),
      notes: varchar('notes', { length: 500 }),
      logged_by_membership_id: bigint('logged_by_membership_id', { mode: 'number' }),
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
      uniqueIndex('idx_medical_rep_visits_public_id').on(table.public_id),
      index('idx_medical_rep_visits_rep_visit_date').on(
        table.medical_rep_id,
        table.visit_date.desc(),
        table.id,
      ),
      index('idx_medical_rep_visits_organization_logged_by').on(
        table.organization_id,
        table.logged_by_membership_id,
      ),
      index('idx_medical_rep_visits_logged_by_membership_id')
        .on(table.logged_by_membership_id)
        .where(sql`${table.logged_by_membership_id} IS NOT NULL`),
      index('idx_medical_rep_visits_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_medical_rep_visits_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_medical_rep_visits_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      check(
        'chk_medical_rep_visits_next_visit_on',
        sql`${table.next_visit_on} > ${table.visit_date}`,
      ),
      check('chk_medical_rep_visits_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_medical_rep_visits_delete_reason',
        sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_medical_rep_visits_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_medical_rep_visits_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
      ),
      foreignKey({
        name: 'medical_rep_visits_logged_by_membership_fk',
        columns: [table.organization_id, table.logged_by_membership_id],
        foreignColumns: [memberships.organization_id, memberships.id],
      }).onDelete('restrict'),
      pgPolicy('medical_rep_visits_tenant_isolation', {
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
