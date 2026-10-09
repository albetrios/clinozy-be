import { type BuildExtraConfigColumns, sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  pgPolicy,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenanceBypassArm } from '@/infrastructure/database/pg-schemas.js';
import { sqlLiteral, sqlLiteralList } from '@/infrastructure/database/utils/sql-literal.util.js';
import { users } from '@/domains/user/user.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';
import { patient_reviews } from '@/domains/app/sub-domains/patients/patient-reviews/patient-reviews.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { pending_credits } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.schema.js';
import { medical_reps } from '@/domains/app/sub-domains/medical/medical-reps/medical-reps.schema.js';
import { RECORD_DELETE_REASON_VALUES } from '@/shared/constants/record-fields.constants.js';
import {
  TASK_KIND,
  TASK_KIND_VALUES,
  TASK_OUTCOME_VALUES,
  TASK_OWNER_ROLE_VALUES,
  TASK_PRIORITY_VALUES,
  TASK_RULE_VALUES,
  TASK_STATUS,
  TASK_STATUS_VALUES,
} from '@/domains/app/sub-domains/tasks/tasks.constants.js';

/** The organization policy of a task table, with the retention-cleanup arm when it is purged. */
function organizationPolicy(options: {
  name: string;
  organizationId: AnyPgColumn;
  purged: boolean;
}) {
  const own = sql`${options.organizationId} = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )`;
  return pgPolicy(options.name, {
    as: 'permissive',
    for: 'all',
    to: 'public',
    using: options.purged
      ? sql`${own}
          OR ${maintenanceBypassArm('app.global_retention_cleanup')}`
      : own,
    withCheck: own,
  });
}

/** The columns of `app.tasks`. */
const taskColumns = {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  public_id: varchar('public_id', { length: 28 }).notNull(),
  organization_id: bigint('organization_id', { mode: 'number' })
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 9 }).notNull().default('manual'),
  // The rule that made it (TK6)
  rule_key: varchar('rule_key', { length: 17 }),
  title: varchar('title', { length: 120 }).notNull(),
  why: varchar('why', { length: 280 }),
  // An owner, or — nobody yet — a role queue (TK6); a K8 key into this organization's members
  owner_membership_id: bigint('owner_membership_id', { mode: 'number' }),
  owner_role: varchar('owner_role', { length: 10 }),
  // The person (TK5)
  contact_id: bigint('contact_id', { mode: 'number' }).references((): AnyPgColumn => contacts.id, {
    onDelete: 'cascade',
  }),
  // The record — at most one (TK5)
  lead_id: bigint('lead_id', { mode: 'number' }).references((): AnyPgColumn => leads.id, {
    onDelete: 'cascade',
  }),
  appointment_id: bigint('appointment_id', { mode: 'number' }).references(
    (): AnyPgColumn => appointments.id,
    { onDelete: 'cascade' },
  ),
  patient_treatment_id: bigint('patient_treatment_id', { mode: 'number' }).references(
    (): AnyPgColumn => patient_treatments.id,
    { onDelete: 'cascade' },
  ),
  patient_check_in_id: bigint('patient_check_in_id', { mode: 'number' }).references(
    (): AnyPgColumn => patient_check_ins.id,
    { onDelete: 'cascade' },
  ),
  patient_review_id: bigint('patient_review_id', { mode: 'number' }).references(
    (): AnyPgColumn => patient_reviews.id,
    { onDelete: 'cascade' },
  ),
  invoice_id: bigint('invoice_id', { mode: 'number' }).references((): AnyPgColumn => invoices.id, {
    onDelete: 'cascade',
  }),
  pending_credit_id: bigint('pending_credit_id', { mode: 'number' }).references(
    (): AnyPgColumn => pending_credits.id,
    { onDelete: 'cascade' },
  ),
  // The MR whose next visit it reminds of (launch #153, MD8)
  medical_rep_id: bigint('medical_rep_id', { mode: 'number' }).references(
    (): AnyPgColumn => medical_reps.id,
    { onDelete: 'cascade' },
  ),
  // The one record (else the person) as text — one open task per rule per record (TK4)
  source_key: text('source_key').generatedAlwaysAs(
    (): SQL => sql`CASE
      WHEN lead_id IS NOT NULL THEN 'lead:' || lead_id
      WHEN appointment_id IS NOT NULL THEN 'appointment:' || appointment_id
      WHEN patient_treatment_id IS NOT NULL THEN 'patient_treatment:' || patient_treatment_id
      WHEN patient_check_in_id IS NOT NULL THEN 'patient_check_in:' || patient_check_in_id
      WHEN patient_review_id IS NOT NULL THEN 'patient_review:' || patient_review_id
      WHEN invoice_id IS NOT NULL THEN 'invoice:' || invoice_id
      WHEN pending_credit_id IS NOT NULL THEN 'pending_credit:' || pending_credit_id
      WHEN medical_rep_id IS NOT NULL THEN 'medical_rep:' || medical_rep_id
      WHEN contact_id IS NOT NULL THEN 'contact:' || contact_id
    END`,
  ),
  // Copied from the record (TK3)
  branch_id: bigint('branch_id', { mode: 'number' }).references(() => branches.id, {
    onDelete: 'set null',
  }),
  due_at: timestamp('due_at', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 7 }).notNull().default('open'),
  snoozed_until: timestamp('snoozed_until', { withTimezone: true }),
  snooze_label: varchar('snooze_label', { length: 40 }),
  outcome: varchar('outcome', { length: 12 }),
  // The outcome's label — "Confirmed on call"
  result_text: varchar('result_text', { length: 200 }),
  note: varchar('note', { length: 280 }),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  // "Done by Clinozy"
  is_resolved_automatically: boolean('is_resolved_automatically').notNull().default(false),
  // Clinozy took the task's step itself (TK10) — not only closed it because its record changed;
  // like a person's resolution it keeps the rule quiet while the condition holds
  is_handled_by_clinozy: boolean('is_handled_by_clinozy').notNull().default(false),
  resolved_by_membership_id: bigint('resolved_by_membership_id', { mode: 'number' }),
  priority: varchar('priority', { length: 6 }).notNull().default('normal'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(() => users.id),
  updated_by_user_id: bigint('updated_by_user_id', { mode: 'number' }).references(() => users.id),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
  delete_reason: varchar('delete_reason', { length: 20 }),
  delete_note: varchar('delete_note', { length: 280 }),
};

/** The table as its index and check builders see it. */
type TaskTable = BuildExtraConfigColumns<'tasks', typeof taskColumns, 'pg'>;

/** The record links of a task, each with its partial index. */
const TASK_RECORD_LINKS = [
  'lead_id',
  'appointment_id',
  'patient_treatment_id',
  'patient_check_in_id',
  'patient_review_id',
  'invoice_id',
  'pending_credit_id',
  'medical_rep_id',
] as const;

/** The task indexes: one open task per rule per record (TK4), Mine, the queues, Everyone, the wake-up. */
function taskIndexes(table: TaskTable) {
  const live = sql`${table.deleted_at} IS NULL`;
  return [
    uniqueIndex('idx_tasks_public_id').on(table.public_id),
    uniqueIndex('idx_tasks_open_rule_source')
      .on(table.organization_id, table.rule_key, table.source_key)
      .where(
        sql`${table.kind} = ${sqlLiteral(TASK_KIND.RULE)} AND ${table.status} <> ${sqlLiteral(TASK_STATUS.DONE)} AND ${live}`,
      ),
    index('idx_tasks_owner_status_due').on(
      table.organization_id,
      table.owner_membership_id,
      table.status,
      table.due_at,
    ),
    index('idx_tasks_organization_queue')
      .on(table.organization_id, table.owner_role, table.status, table.due_at)
      .where(sql`${live} AND ${table.owner_membership_id} IS NULL`),
    index('idx_tasks_organization_status_due').on(
      table.organization_id,
      table.status,
      table.due_at,
      table.id,
    ),
    index('idx_tasks_snoozed_until')
      .on(table.snoozed_until)
      .where(sql`${table.status} = ${sqlLiteral(TASK_STATUS.SNOOZED)} AND ${live}`),
    index('idx_tasks_contact_id').on(table.contact_id).where(sql`${table.contact_id} IS NOT NULL`),
    ...TASK_RECORD_LINKS.map((column) =>
      index(`idx_tasks_${column}`).on(table[column]).where(sql`${table[column]} IS NOT NULL`),
    ),
    index('idx_tasks_branch_id').on(table.branch_id).where(sql`${table.branch_id} IS NOT NULL`),
    index('idx_tasks_resolved_by_membership_id')
      .on(table.organization_id, table.resolved_by_membership_id)
      .where(sql`${table.resolved_by_membership_id} IS NOT NULL`),
    index('idx_tasks_deleted_at').on(table.deleted_at).where(sql`${table.deleted_at} IS NOT NULL`),
    index('idx_tasks_created_by_user_id')
      .on(table.created_by_user_id)
      .where(sql`${table.created_by_user_id} IS NOT NULL`),
    index('idx_tasks_updated_by_user_id')
      .on(table.updated_by_user_id)
      .where(sql`${table.updated_by_user_id} IS NOT NULL`),
  ];
}

/** The task checks: kinds, owner or queue, at most one record, the lifecycle (TK5–TK7). */
function taskChecks(table: TaskTable) {
  const links = sql.join(
    TASK_RECORD_LINKS.map((column) => sql`${table[column]}`),
    sql`, `,
  );
  return [
    check('chk_tasks_kind', sql`${table.kind} IN (${sqlLiteralList(TASK_KIND_VALUES)})`),
    check('chk_tasks_rule_key', sql`${table.rule_key} IN (${sqlLiteralList(TASK_RULE_VALUES)})`),
    check(
      'chk_tasks_rule_kind',
      sql`(${table.kind} = ${sqlLiteral(TASK_KIND.RULE)}) = (${table.rule_key} IS NOT NULL)`,
    ),
    check('chk_tasks_title', sql`char_length(${table.title}) > 0`),
    check(
      'chk_tasks_owner_role',
      sql`${table.owner_role} IN (${sqlLiteralList(TASK_OWNER_ROLE_VALUES)})`,
    ),
    check(
      'chk_tasks_owner_or_queue',
      sql`${table.owner_membership_id} IS NOT NULL OR ${table.owner_role} IS NOT NULL`,
    ),
    check('chk_tasks_one_record', sql`num_nonnulls(${links}) <= 1`),
    check('chk_tasks_status', sql`${table.status} IN (${sqlLiteralList(TASK_STATUS_VALUES)})`),
    check(
      'chk_tasks_snoozed',
      sql`(${table.status} = ${sqlLiteral(TASK_STATUS.SNOOZED)}) = (${table.snoozed_until} IS NOT NULL)`,
    ),
    check('chk_tasks_outcome', sql`${table.outcome} IN (${sqlLiteralList(TASK_OUTCOME_VALUES)})`),
    check(
      'chk_tasks_done',
      sql`(${table.status} = ${sqlLiteral(TASK_STATUS.DONE)}) = (${table.outcome} IS NOT NULL AND ${table.resolved_at} IS NOT NULL)`,
    ),
    check(
      'chk_tasks_priority',
      sql`${table.priority} IN (${sqlLiteralList(TASK_PRIORITY_VALUES)})`,
    ),
    check('chk_tasks_updated', sql`${table.updated_at} >= ${table.created_at}`),
    check(
      'chk_tasks_delete_reason',
      sql`${table.delete_reason} IN (${sqlLiteralList(RECORD_DELETE_REASON_VALUES)})`,
    ),
    check(
      'chk_tasks_delete_reason_when_deleted',
      sql`(${table.deleted_at} IS NULL) = (${table.delete_reason} IS NULL)`,
    ),
    check(
      'chk_tasks_delete_note_when_other',
      sql`${table.delete_reason} IS DISTINCT FROM 'other' OR ${table.delete_note} IS NOT NULL`,
    ),
  ];
}

/**
 * Drizzle table for `app.tasks` — one thing someone has to do (launch ROUTE #138, routes-final
 * 10.A).
 *
 * @remarks
 * - **Notes:** a rule's, a follow-up's or one added by hand (TK6); an owner or a role queue; the
 *   person (`contact_id`) and at most one record (TK5), whose text `source_key` makes one open task
 *   per rule per record (`idx_tasks_open_rule_source`, TK4); the record's branch copied for the
 *   branch filter (TK3); open → snoozed → done with an outcome (TK7); the resolver a K8 key
 *   `RESTRICT` (K2). RLS on the organization GUC with the retention-cleanup arm for the purge.
 */
export const tasks = appSchema
  .table('tasks', taskColumns, (table) => [
    ...taskIndexes(table),
    ...taskChecks(table),
    // K8: a member of this organization; the database clears only this column when the
    // membership row goes (`ON DELETE SET NULL ("owner_membership_id")`).
    foreignKey({
      name: 'tasks_owner_membership_fk',
      columns: [table.organization_id, table.owner_membership_id],
      foreignColumns: [memberships.organization_id, memberships.id],
    }).onDelete('set null'),
    // K8: a member of this organization, kept when they leave (K2)
    foreignKey({
      name: 'tasks_resolved_by_membership_fk',
      columns: [table.organization_id, table.resolved_by_membership_id],
      foreignColumns: [memberships.organization_id, memberships.id],
    }).onDelete('restrict'),
    organizationPolicy({
      name: 'tasks_tenant_isolation',
      organizationId: table.organization_id,
      purged: true,
    }),
  ])
  .enableRLS();

/**
 * Drizzle table for `app.task_owner_changes` — who a task moved from and to, and who moved it (launch
 * ROUTE #138, routes-final 10.A, TK8); no routes of its own (K1).
 *
 * @remarks
 * - **Notes:** append-only — no `updated_*` or soft-delete columns; written by a reassign and by a
 *   member leaving (K4); a role queue or the server is a null member with its role; every member a
 *   K8 key `RESTRICT` (K2); the rows go with their task (`CASCADE`). RLS on the organization GUC.
 */
export const task_owner_changes = appSchema
  .table(
    'task_owner_changes',
    {
      id: bigserial('id', { mode: 'number' }).primaryKey(),
      public_id: varchar('public_id', { length: 28 }).notNull(),
      organization_id: bigint('organization_id', { mode: 'number' })
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
      task_id: bigint('task_id', { mode: 'number' })
        .notNull()
        .references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
      from_membership_id: bigint('from_membership_id', { mode: 'number' }),
      from_role: varchar('from_role', { length: 10 }),
      to_membership_id: bigint('to_membership_id', { mode: 'number' }),
      to_role: varchar('to_role', { length: 10 }),
      // Who moved it — null for the server (a member leaving)
      changed_by_membership_id: bigint('changed_by_membership_id', { mode: 'number' }),
      created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      created_by_user_id: bigint('created_by_user_id', { mode: 'number' }).references(
        () => users.id,
      ),
    },
    (table) => [
      index('idx_task_owner_changes_organization_id').on(table.organization_id),
      uniqueIndex('idx_task_owner_changes_public_id').on(table.public_id),
      index('idx_task_owner_changes_task_created').on(table.task_id, table.created_at),
      index('idx_task_owner_changes_created_by_user_id')
        .on(table.created_by_user_id)
        .where(sql`${table.created_by_user_id} IS NOT NULL`),
      ...(['from_membership_id', 'to_membership_id', 'changed_by_membership_id'] as const).map(
        (column) =>
          index(`idx_task_owner_changes_${column}`)
            .on(table.organization_id, table[column])
            .where(sql`${table[column]} IS NOT NULL`),
      ),
      // K8: members of this organization, kept when they leave (K2)
      ...(['from_membership_id', 'to_membership_id', 'changed_by_membership_id'] as const).map(
        (column) =>
          foreignKey({
            name: `task_owner_changes_${column.replace('_id', '')}_fk`,
            columns: [table.organization_id, table[column]],
            foreignColumns: [memberships.organization_id, memberships.id],
          }).onDelete('restrict'),
      ),
      check(
        'chk_task_owner_changes_from_role',
        sql`${table.from_role} IN (${sqlLiteralList(TASK_OWNER_ROLE_VALUES)})`,
      ),
      check(
        'chk_task_owner_changes_to_role',
        sql`${table.to_role} IN (${sqlLiteralList(TASK_OWNER_ROLE_VALUES)})`,
      ),
      check(
        'chk_task_owner_changes_to',
        sql`${table.to_membership_id} IS NOT NULL OR ${table.to_role} IS NOT NULL`,
      ),
      organizationPolicy({
        name: 'task_owner_changes_tenant_isolation',
        organizationId: table.organization_id,
        purged: false,
      }),
    ],
  )
  .enableRLS();
