import { and, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { buildContainsLikePattern } from '@/shared/utils/http/list-query.util.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import { membershipHoldsRole } from '@/domains/tenancy/sub-domains/membership/membership-additional-roles/membership-additional-roles.schema.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import { role_permissions } from '@/domains/tenancy/sub-domains/member-roles/member-role-permission/member-role-permission.schema.js';
import { BaseRecordRepository, nullsLastSortKeys } from '@/domains/app/base-record.repository.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';
import { patient_reviews } from '@/domains/app/sub-domains/patients/patient-reviews/patient-reviews.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { pending_credits } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.schema.js';
import { medical_reps } from '@/domains/app/sub-domains/medical/medical-reps/medical-reps.schema.js';
import { task_rule_settings } from './task-rule-settings/task-rule-settings.schema.js';
import {
  TASK_KIND,
  TASK_OPEN_STATUS_VALUES,
  TASK_OWNER_CHANGES_SHOWN,
  TASK_OWNER_ROLE_VALUES,
} from './tasks.constants.js';
import type { RuleTaskInput, TaskRecordLink } from './tasks.rule-tasks.js';
import { task_owner_changes, tasks } from './tasks.schema.js';
import type { TaskTypeFilter } from './tasks.types.js';

/** The person and branch a task's record carries (TK3, TK5). */
export interface TaskRecordContext {
  contactId: number | null;
  branchId: number | null;
}

/** What the caller works as: their membership and the role queues they serve (TK3). */
export interface TaskWorker {
  membershipId: number | null;
  roleKeys: string[];
}

/** One owner change as a task reads it — the members' public ids joined in (TK8). */
export interface TaskOwnerChangeRow {
  task_id: number;
  from_membership_id: string | null;
  from_role: string | null;
  to_membership_id: string | null;
  to_role: string | null;
  changed_by_membership_id: string | null;
  created_at: Date;
}

/** A role's queue key — its name in lower case with `_` for spaces (`Front desk` → `front_desk`). */
const ROLE_KEY = sql<string>`replace(lower(${roles.name}), ' ', '_')`;

/** `q` over the title, why and the person's name (10.A.8 #1). */
function searchCondition(value: unknown): SQL {
  const pattern = buildContainsLikePattern(String(value));
  return or(
    sql`${tasks.title} ilike ${pattern}`,
    sql`${tasks.why} ilike ${pattern}`,
    sql`exists (select 1 from ${contacts} where ${contacts.id} = ${tasks.contact_id} and (${contacts.first_name} || ' ' || coalesce(${contacts.last_name}, '')) ilike ${pattern})`,
  ) as SQL;
}

/** D81 T6, the type filter: a task of one of the rules named, or of one of the kinds named. */
function typeCondition(value: unknown): SQL {
  const { ruleKeys, kinds } = value as TaskTypeFilter;
  const conditions = [
    ...(ruleKeys.length > 0 ? [inArray(tasks.rule_key, ruleKeys)] : []),
    ...(kinds.length > 0 ? [inArray(tasks.kind, kinds)] : []),
  ];
  return or(...conditions) ?? sql`false`;
}

/** TK3 "Mine": owned by me, or unowned in the queue of one of my roles. */
function mineCondition(value: unknown): SQL {
  const worker = value as TaskWorker;
  const mine =
    worker.membershipId === null ? sql`false` : eq(tasks.owner_membership_id, worker.membershipId);
  if (worker.roleKeys.length === 0) return mine;
  return or(
    mine,
    and(isNull(tasks.owner_membership_id), inArray(tasks.owner_role, worker.roleKeys)),
  ) as SQL;
}

/** The done tab's default: resolved since the start of the organization's today (10.A.8 #1). */
function resolvedTodayCondition(_value: unknown, organizationId: number): SQL {
  const timezone = sql`(select ${organizations.timezone} from ${organizations} where ${organizations.id} = ${organizationId})`;
  return sql`${tasks.resolved_at} >= ((now() at time zone ${timezone})::date::timestamp at time zone ${timezone})`;
}

/** A patient table's record: the patient's contact, and the visit's branch else the home branch. */
function patientRecordContext(
  table: typeof patient_check_ins | typeof patient_reviews | typeof patient_treatments,
) {
  return {
    contactId: patients.contact_id,
    branchId: sql<
      number | null
    >`coalesce((select ${appointments.branch_id} from ${appointments} where ${appointments.id} = ${table.appointment_id}), ${patients.home_branch_id})`,
  };
}

/** 10.10: a rule that is off hides its tasks from every tab. */
const RULE_IS_ON = sql`(${tasks.kind} <> ${TASK_KIND.RULE} OR NOT EXISTS (
  select 1 from ${task_rule_settings}
  where ${task_rule_settings.organization_id} = ${tasks.organization_id}
    and ${task_rule_settings.rule_key} = ${tasks.rule_key}
    and NOT ${task_rule_settings.is_on}))`;

/**
 * Persistence for `app.tasks` and `app.task_owner_changes` (launch ROUTE #138, routes-final 10.A) —
 * the shared reads and writes, plus who works the queues, the owner changes and the leave step.
 *
 * @remarks
 * - **Algorithm:** `q` (title, why, the person's name), `type` (the rules or kinds named, D81 T6),
 *   `mine` (TK3) and `rules_on` (10.10) are derived filters; sorts `due_at` (default, soonest first), `resolved_at` (none last) and
 *   `created_at`. A member can work tasks when they are active and one of their roles holds
 *   `task:read` (the role tables are tenancy's — read for this check only).
 */
export class TasksRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: tasks,
      entity: 'task',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      sortKeys: {
        due_at: { keys: [{ value: 'due_at' }], defaultOrder: 'asc' },
        resolved_at: {
          keys: nullsLastSortKeys({
            value: () => sql`${tasks.resolved_at}`,
            sqlType: 'timestamptz',
            empty: sql`'-infinity'::timestamptz`,
            defaultOrder: 'desc',
          }),
          defaultOrder: 'desc',
        },
      },
      derivedFilters: {
        search: searchCondition,
        type: typeCondition,
        mine: mineCondition,
        rules_on: () => RULE_IS_ON,
        resolved_today: resolvedTodayCondition,
      },
      defaultSort: 'due_at',
      defaultOrder: 'asc',
    });
  }

  /** TK3: the caller's membership and the role queues their roles serve. */
  async findWorker(options: {
    organizationId: number;
    userId: number | null;
  }): Promise<TaskWorker> {
    if (options.userId === null) return { membershipId: null, roleKeys: [] };
    const rows = await getRequestDatabase()
      .select({ membership_id: memberships.id, role_key: ROLE_KEY })
      .from(memberships)
      .innerJoin(roles, membershipHoldsRole(roles.id))
      .where(
        and(
          eq(memberships.organization_id, options.organizationId),
          eq(memberships.user_id, options.userId),
          isNull(memberships.deleted_at),
          isNull(roles.deleted_at),
        ),
      );
    const known = new Set<string>(TASK_OWNER_ROLE_VALUES);
    return {
      membershipId: rows[0]?.membership_id ?? null,
      roleKeys: [...new Set(rows.map((row) => row.role_key).filter((key) => known.has(key)))],
    };
  }

  /**
   * TK4: inserts a rule's task unless one is open for the same rule and record already (the unique
   * open-task index — `ON CONFLICT DO NOTHING`); true when it inserted one. TK6: an owner, or —
   * nobody — the role queue.
   */
  async insertRuleTask(input: RuleTaskInput): Promise<boolean> {
    const rows = await getRequestDatabase()
      .insert(tasks)
      .values({
        public_id: generatePublicId('task'),
        organization_id: input.organizationId,
        kind: TASK_KIND.RULE,
        rule_key: input.rule,
        title: input.title,
        why: input.why,
        owner_membership_id: input.ownerMembershipId,
        owner_role: input.ownerMembershipId === null ? input.ownerRole : null,
        contact_id: input.contactId,
        ...input.link,
        branch_id: input.branchId,
        due_at: input.dueAt,
        priority: input.priority ?? 'normal',
        created_by_user_id: input.userId,
        updated_by_user_id: input.userId,
      } as never)
      .onConflictDoNothing()
      .returning({ id: tasks.id });
    return rows.length > 0;
  }

  /** TK3, TK5: the person and branch of the record a task points at (null when it is not here). */
  async findRecordContext(options: {
    link: TaskRecordLink;
    id: number;
  }): Promise<TaskRecordContext | null> {
    const database = getRequestDatabase();
    const single = async (
      query: Promise<{ contactId: number | null; branchId: number | null }[]>,
    ): Promise<TaskRecordContext | null> => (await query)[0] ?? null;
    switch (options.link) {
      case 'lead_id':
        return single(
          database
            .select({ contactId: leads.contact_id, branchId: leads.branch_id })
            .from(leads)
            .where(eq(leads.id, options.id)),
        );
      case 'appointment_id':
        return single(
          database
            .select({ contactId: appointments.contact_id, branchId: appointments.branch_id })
            .from(appointments)
            .where(eq(appointments.id, options.id)),
        );
      case 'invoice_id':
        return single(
          database
            .select({ contactId: invoices.contact_id, branchId: invoices.branch_id })
            .from(invoices)
            .where(eq(invoices.id, options.id)),
        );
      case 'pending_credit_id':
        return single(
          database
            .select({ contactId: pending_credits.contact_id, branchId: sql<null>`null` })
            .from(pending_credits)
            .where(eq(pending_credits.id, options.id)),
        );
      case 'medical_rep_id':
        return single(
          database
            .select({ contactId: sql<null>`null`, branchId: sql<null>`null` })
            .from(medical_reps)
            .where(eq(medical_reps.id, options.id)),
        );
      case 'patient_treatment_id':
        return single(
          database
            .select(patientRecordContext(patient_treatments))
            .from(patient_treatments)
            .innerJoin(patients, eq(patients.id, patient_treatments.patient_id))
            .where(eq(patient_treatments.id, options.id)),
        );
      case 'patient_check_in_id':
        return single(
          database
            .select(patientRecordContext(patient_check_ins))
            .from(patient_check_ins)
            .innerJoin(patients, eq(patients.id, patient_check_ins.patient_id))
            .where(eq(patient_check_ins.id, options.id)),
        );
      case 'patient_review_id':
        return single(
          database
            .select(patientRecordContext(patient_reviews))
            .from(patient_reviews)
            .innerJoin(patients, eq(patients.id, patient_reviews.patient_id))
            .where(eq(patient_reviews.id, options.id)),
        );
    }
  }

  /** TK7: the live patient file of a contact (a check-in's patient), or null. */
  async findPatientIdOfContact(contactId: number): Promise<number | null> {
    const rows = await getRequestDatabase()
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.contact_id, contactId), isNull(patients.deleted_at)))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /** TK6: whether a member is active here and one of their roles holds `code` (`task:read`). */
  async membershipHolds(options: {
    organizationId: number;
    membershipId: number;
    code: string;
  }): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(roles, membershipHoldsRole(roles.id))
      .innerJoin(role_permissions, eq(role_permissions.role_id, roles.id))
      .where(
        and(
          eq(memberships.id, options.membershipId),
          eq(memberships.organization_id, options.organizationId),
          eq(memberships.status, MEMBERSHIP_STATUS.ACTIVE),
          isNull(memberships.deleted_at),
          isNull(roles.deleted_at),
          eq(role_permissions.permission_code, options.code),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** K4: a member's main role key, for the queue their tasks return to (null for a custom role). */
  async findRoleKeyOfMembership(membershipId: number): Promise<string | null> {
    const rows = await getRequestDatabase()
      .select({ role_key: ROLE_KEY })
      .from(memberships)
      .innerJoin(roles, eq(roles.id, memberships.role_id))
      .where(eq(memberships.id, membershipId))
      .limit(1);
    const key = rows[0]?.role_key ?? null;
    return key !== null && (TASK_OWNER_ROLE_VALUES as readonly string[]).includes(key) ? key : null;
  }

  /** TK8: records who a task moved from and to, and who moved it. */
  async insertOwnerChange(options: {
    organizationId: number;
    taskId: number;
    from: { membershipId: number | null; role: string | null };
    to: { membershipId: number | null; role: string | null };
    changedByMembershipId: number | null;
    userId: number | null;
  }): Promise<void> {
    await getRequestDatabase()
      .insert(task_owner_changes)
      .values({
        public_id: generatePublicId('taskOwnerChange'),
        organization_id: options.organizationId,
        task_id: options.taskId,
        from_membership_id: options.from.membershipId,
        from_role: options.from.role,
        to_membership_id: options.to.membershipId,
        to_role: options.to.role,
        changed_by_membership_id: options.changedByMembershipId,
        created_by_user_id: options.userId,
      });
  }

  /** TK8: the latest owner changes of a page of tasks, newest first (up to five each). */
  async findOwnerChanges(taskIds: readonly number[]): Promise<Map<number, TaskOwnerChangeRow[]>> {
    if (taskIds.length === 0) return new Map();
    const member = (column: AnyPgColumn) =>
      sql<
        string | null
      >`(select ${memberships.public_id} from ${memberships} where ${memberships.id} = ${column})`;
    const rows = await getRequestDatabase()
      .select({
        task_id: task_owner_changes.task_id,
        from_membership_id: member(task_owner_changes.from_membership_id),
        from_role: task_owner_changes.from_role,
        to_membership_id: member(task_owner_changes.to_membership_id),
        to_role: task_owner_changes.to_role,
        changed_by_membership_id: member(task_owner_changes.changed_by_membership_id),
        created_at: task_owner_changes.created_at,
      })
      .from(task_owner_changes)
      .where(inArray(task_owner_changes.task_id, [...taskIds]))
      .orderBy(desc(task_owner_changes.created_at), desc(task_owner_changes.id));
    const byTask = new Map<number, TaskOwnerChangeRow[]>();
    for (const row of rows) {
      const list = byTask.get(row.task_id) ?? [];
      if (list.length < TASK_OWNER_CHANGES_SHOWN) list.push(row);
      byTask.set(row.task_id, list);
    }
    return byTask;
  }

  /**
   * K4: a member who leaves — their open tasks go back to their role queue (the task's, else the
   * member's main role's, else Admin's), each with an owner-change row by the server.
   */
  async releaseForMembership(options: {
    organizationId: number;
    membershipId: number;
  }): Promise<void> {
    const fallbackRole = (await this.findRoleKeyOfMembership(options.membershipId)) ?? 'admin';
    const released = await getRequestDatabase()
      .update(tasks)
      .set({
        owner_membership_id: null,
        owner_role: fallbackRole,
        updated_at: sql`greatest(${tasks.created_at}, now())`,
      } as never)
      .where(
        and(
          eq(tasks.organization_id, options.organizationId),
          eq(tasks.owner_membership_id, options.membershipId),
          inArray(tasks.status, [...TASK_OPEN_STATUS_VALUES]),
          isNull(tasks.deleted_at),
        ),
      )
      .returning({ id: tasks.id, owner_role: tasks.owner_role });
    for (const task of released) {
      await this.insertOwnerChange({
        organizationId: options.organizationId,
        taskId: task.id,
        from: { membershipId: options.membershipId, role: null },
        to: { membershipId: null, role: task.owner_role },
        changedByMembershipId: null,
        userId: null,
      });
    }
  }
}
