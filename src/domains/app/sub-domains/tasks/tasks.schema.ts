import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
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
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import {
  RECORD_DELETE_REASON,
  RECORD_DELETE_REASON_VALUES,
} from '@/shared/constants/record-fields.constants.js';
import {
  TASK_KIND_VALUES,
  TASK_RULE_KEY_VALUES,
  TASK_OWNER_ROLE_VALUES,
  TASK_SOURCE_TYPE_VALUES,
  TASK_STATUS_VALUES,
  TASK_OUTCOME_VALUES,
  TASK_PRIORITY_VALUES,
} from '@/domains/app/sub-domains/tasks/tasks.constants.js';

/** `'a', 'b', …` from a value list, for an `IN (…)` or `ARRAY[…]` CHECK. */
function joinValues(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/**
 * Drizzle table for `app.tasks` — A to-do in the work queue — by hand or from a rule (launch ROUTE #58, domain `app`).
 * Standard app record columns (public id, organization, attribution, soft delete with its reason);
 * RLS is the `tasks_tenant_isolation` policy on the organization GUC, with the retention-cleanup arm
 * for the deleted-record purge.
 */
export const tasks = appSchema
  .table(
    'tasks',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      kind: varchar('kind', { length: 16 }).notNull().default('manual'),
      // The rule that made it
      rule_key: varchar('rule_key', { length: 17 }),
      title: varchar('title', { length: 120 }).notNull(),
      why: varchar('why', { length: 280 }),
      owner_membership_id: bigint('owner_membership_id', { mode: 'number' }).references(
        () => memberships.id,
        { onDelete: 'set null' },
      ),
      // The role queue — where the task falls back when no one owns it
      owner_role: varchar('owner_role', { length: 10 }).notNull().default('admin'),
      patient_id: bigint('patient_id', { mode: 'number' }).references(
        (): AnyPgColumn => patients.id,
        { onDelete: 'set null' },
      ),
      lead_id: bigint('lead_id', { mode: 'number' }).references((): AnyPgColumn => leads.id, {
        onDelete: 'set null',
      }),
      source_type: varchar('source_type', { length: 11 }),
      // The source record's public id
      source_id: varchar('source_id', { length: 28 }),
      due_at: timestamp('due_at', { withTimezone: true }).notNull(),
      status: varchar('status', { length: 7 }).notNull().default('open'),
      snoozed_until: timestamp('snoozed_until', { withTimezone: true }),
      snooze_label: varchar('snooze_label', { length: 40 }),
      outcome: varchar('outcome', { length: 12 }),
      resolved_at: timestamp('resolved_at', { withTimezone: true }),
      // "Done by Clinozy"
      is_resolved_automatically: boolean('is_resolved_automatically').notNull().default(false),
      result_text: varchar('result_text', { length: 280 }),
      note: varchar('note', { length: 280 }),
      priority: varchar('priority', { length: 6 }).notNull().default('normal'),
      should_remind_before: boolean('should_remind_before').notNull().default(false),
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
      uniqueIndex('idx_tasks_public_id').on(table.public_id),
      index('idx_tasks_organization_created').on(table.organization_id, table.created_at, table.id),
      index('idx_tasks_deleted_at')
        .on(table.deleted_at)
        .where(sql`${table.deleted_at} IS NOT NULL`),
      index('idx_tasks_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      index('idx_tasks_updated_by_user_id')
        .on(table.updated_by_user_id)
        .where(sql`${table.updated_by_user_id} IS NOT NULL`),
      index('idx_tasks_owner_due')
        .on(table.owner_membership_id, table.due_at)
        .where(sql`${table.owner_membership_id} IS NOT NULL`),
      index('idx_tasks_patient_id')
        .on(table.patient_id)
        .where(sql`${table.patient_id} IS NOT NULL`),
      index('idx_tasks_lead_id').on(table.lead_id).where(sql`${table.lead_id} IS NOT NULL`),
      index('idx_tasks_organization_due_at')
        .on(table.organization_id, table.due_at, table.id)
        .where(sql`${table.deleted_at} IS NULL`),
      check('chk_tasks_kind', sql`${table.kind} IN (${joinValues(TASK_KIND_VALUES)})`),
      check('chk_tasks_rule_key', sql`${table.rule_key} IN (${joinValues(TASK_RULE_KEY_VALUES)})`),
      check(
        'chk_tasks_owner_role',
        sql`${table.owner_role} IN (${joinValues(TASK_OWNER_ROLE_VALUES)})`,
      ),
      check(
        'chk_tasks_source_type',
        sql`${table.source_type} IN (${joinValues(TASK_SOURCE_TYPE_VALUES)})`,
      ),
      check('chk_tasks_status', sql`${table.status} IN (${joinValues(TASK_STATUS_VALUES)})`),
      check('chk_tasks_outcome', sql`${table.outcome} IN (${joinValues(TASK_OUTCOME_VALUES)})`),
      check('chk_tasks_priority', sql`${table.priority} IN (${joinValues(TASK_PRIORITY_VALUES)})`),
      check('chk_tasks_updated', sql`${table.updated_at} >= ${table.created_at}`),
      check(
        'chk_tasks_delete_reason',
        sql`${table.delete_reason} IN (${joinValues(RECORD_DELETE_REASON_VALUES)})`,
      ),
      check(
        'chk_tasks_delete_reason_when_deleted',
        sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
      ),
      check(
        'chk_tasks_delete_note_when_other',
        sql`${table.delete_reason} IS DISTINCT FROM ${RECORD_DELETE_REASON.OTHER} OR ${table.delete_note} IS NOT NULL`,
      ),
      pgPolicy('tasks_tenant_isolation', {
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
