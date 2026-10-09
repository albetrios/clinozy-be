import { and, asc, eq, gt, inArray, isNull, lte, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { assertWorkerDatabaseContext } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { RESOURCE_QUOTA_LOCK_NAMESPACE } from '@/infrastructure/database/resource-quota-lock.util.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { organization_settings } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { contact_activities } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.schema.js';
import type { ContactActivityAutomationKind } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { LEAD_OPEN_STATUS_VALUES } from '@/domains/app/sub-domains/leads/leads.constants.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import {
  ORGANIZATION_SETTINGS_DEFAULT_REMINDER_HOUR,
  ORGANIZATION_SETTINGS_DEFAULT_RETARGET_AFTER_DAYS,
} from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.constants.js';
import { task_rule_settings } from './task-rule-settings/task-rule-settings.schema.js';
import {
  TASK_DONE_BY_CLINOZY,
  TASK_KIND,
  TASK_OUTCOME,
  TASK_STATUS,
  type TaskRule,
} from './tasks.constants.js';
import {
  ruleStillHolds,
  TASK_SOURCE_KEY_PREFIX,
  type TaskRuleScope,
  type TaskRuleSource,
} from './task-rule-conditions.repository.js';
import { tasks } from './tasks.schema.js';
import {
  TASK_RULES_SWEEP_BATCH,
  TASK_RULES_TASKS_PER_RULE,
} from './workers/task-rules.constants.js';

/** A rule's switches for an organization (TK10) — no row: on, by hand. */
export interface TaskRuleSwitch {
  isOn: boolean;
  isAutomatic: boolean;
}

/** The organization a rules run is for — its clock, and what its messages need (D74, D78). */
export interface TaskRulesOrganization {
  id: number;
  timeZone: string;
  /** The clinic's hour for the day-before reminder (D34). */
  reminderHour: number;
  /** Whether the clinic's WhatsApp number is on the platform Meta app (D77). */
  isWhatsAppConnected: boolean;
  /** The days without a visit after which a patient gets a re-target lead (D35). */
  retargetAfterDays: number;
}

/** A patient whose last visit was long enough ago for a re-target lead (D35, WC-17). */
export interface LapsedPatient {
  contactId: number;
  /** The branch of their last visit — the lead's. */
  branchId: number | null;
}

/** A record a message the app sends points at (M5). */
export type ClinozyMessageLink =
  | { appointment_id: number }
  | { invoice_id: number }
  | { payment_id: number }
  | Record<string, never>;

/** An open task "Let the app handle" takes (TK10), with what its message says. */
export interface ClinozyStepTask {
  taskId: number;
  rule: TaskRule;
  contactId: number | null;
  firstName: string | null;
  branchId: number | null;
  appointmentId: number | null;
  invoiceId: number | null;
  visitDate: string | null;
  visitTime: string | null;
  /** The booking's messages so far (`confirm` — D78: the confirm step sends only when none went). */
  reminderStatus: string | null;
  invoiceNumber: string | null;
  dueAmount: string | null;
  /** The person replied STOP to automated messages (D32) — no message goes to them. */
  areNoticesStopped: boolean;
}

/** A candidate row of a rule's SELECT (bigint and timestamp columns come back as text or Date). */
type CandidateRow = {
  record_id: string | number;
  contact_id: string | number | null;
  branch_id: string | number | null;
  owner_membership_id: string | number | null;
  due_at: string | Date;
  title: string;
  why: string | null;
};

/** A nullable id column read through `execute`. */
function idOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * The sweep's read (TK4): the active team organizations after `afterId`, in id order, one batch —
 * the sweep pages through all of them every five minutes.
 *
 * @remarks
 * - **Algorithm:** one keyset read of `tenancy.organizations` under the global retention cleanup
 *   context.
 * - **Failure modes:** `WorkerDatabaseContextError` outside that context.
 */
export async function findOrganizationsForTaskRules(
  databaseHandle: WorkerDatabaseHandle,
  afterId: number,
): Promise<{ id: number; publicId: string }[]> {
  assertWorkerDatabaseContext(['global_retention_cleanup']);
  return databaseHandle
    .select({ id: organizations.id, publicId: organizations.public_id })
    .from(organizations)
    .where(
      and(
        gt(organizations.id, afterId),
        eq(organizations.type, 'TEAM'),
        eq(organizations.status, 'ACTIVE'),
        isNull(organizations.deleted_at),
        isNull(organizations.deletion_started_at),
      ),
    )
    .orderBy(asc(organizations.id))
    .limit(TASK_RULES_SWEEP_BATCH);
}

/**
 * The task rules job's reads and writes (TK4, TK10) on an explicit handle pinned to one
 * organization's context.
 *
 * @remarks
 * - **Algorithm:** every rule is SQL ({@link TaskRuleSource}): its open tasks whose record no
 *   longer qualifies close as done by the app; its records that qualify and have no open task — nor
 *   one a person resolved since the condition began — get one (at most a batch per rule per run;
 *   the unique open-task index keeps it one per rule per record under a race).
 */
export class TaskRulesRepository {
  constructor(private readonly databaseHandle: WorkerDatabaseHandle) {}

  /** The organization's internal id, time zone, reminder hour and WhatsApp connection. */
  async findOrganization(organizationPublicId: string): Promise<TaskRulesOrganization | null> {
    const rows = await this.databaseHandle
      .select({
        id: organizations.id,
        timeZone: organizations.timezone,
        reminderHour: organization_settings.reminder_hour,
        retargetAfterDays: organization_settings.retarget_after_days,
        whatsappPhoneNumberId: organization_settings.whatsapp_phone_number_id,
      })
      .from(organizations)
      .leftJoin(organization_settings, eq(organization_settings.organization_id, organizations.id))
      .where(eq(organizations.public_id, organizationPublicId))
      .limit(1);
    const row = rows[0];
    return row
      ? {
          id: row.id,
          timeZone: row.timeZone ?? 'UTC',
          reminderHour: row.reminderHour ?? ORGANIZATION_SETTINGS_DEFAULT_REMINDER_HOUR,
          isWhatsAppConnected: (row.whatsappPhoneNumberId ?? null) !== null,
          retargetAfterDays:
            row.retargetAfterDays ?? ORGANIZATION_SETTINGS_DEFAULT_RETARGET_AFTER_DAYS,
        }
      : null;
  }

  /**
   * One run of an organization's rules at a time (TK10, D78): a transaction-scoped advisory lock in
   * the `TASK_RULES_RUN` space, keyed by the organization. A second run — a retried or stalled job
   * beside a fresh one — waits for the first to commit, then sees its steps taken and its notices
   * queued, so nothing goes out twice. Released at the run's commit or rollback.
   */
  async lockRun(organizationId: number): Promise<void> {
    await this.databaseHandle.execute(
      sql`SELECT pg_advisory_xact_lock(${RESOURCE_QUOTA_LOCK_NAMESPACE.TASK_RULES_RUN}::int, ${organizationId}::int)`,
    );
  }

  /** TK7: snoozed tasks whose time has come are open again. */
  async wakeSnoozed(organizationId: number): Promise<number> {
    const rows = await this.databaseHandle
      .update(tasks)
      .set({
        status: TASK_STATUS.OPEN,
        snoozed_until: null,
        snooze_label: null,
        updated_at: sql`greatest(now(), ${tasks.created_at})`,
      } as never)
      .where(
        and(
          eq(tasks.organization_id, organizationId),
          eq(tasks.status, TASK_STATUS.SNOOZED),
          lte(tasks.snoozed_until, sql`now()`),
          isNull(tasks.deleted_at),
        ),
      )
      .returning({ id: tasks.id });
    return rows.length;
  }

  /** TK10: the organization's saved switches, by rule. */
  async findRuleSwitches(organizationId: number): Promise<Map<string, TaskRuleSwitch>> {
    const rows = await this.databaseHandle
      .select({
        rule: task_rule_settings.rule_key,
        isOn: task_rule_settings.is_on,
        isAutomatic: task_rule_settings.is_automatic,
      })
      .from(task_rule_settings)
      .where(eq(task_rule_settings.organization_id, organizationId));
    return new Map(rows.map((row) => [row.rule, { isOn: row.isOn, isAutomatic: row.isAutomatic }]));
  }

  /** TK4: closes the rule's open tasks whose record no longer qualifies — done by the app. */
  async closeGoneTasks(options: {
    organizationId: number;
    source: TaskRuleSource;
  }): Promise<number> {
    const rows = await this.databaseHandle
      .update(tasks)
      .set(closedByClinozy({ isHandled: false }))
      .where(
        and(
          eq(tasks.organization_id, options.organizationId),
          eq(tasks.kind, TASK_KIND.RULE),
          eq(tasks.rule_key, options.source.rule),
          inArray(tasks.status, [TASK_STATUS.OPEN, TASK_STATUS.SNOOZED]),
          isNull(tasks.deleted_at),
          sql`not ${ruleStillHolds(options.source)}`,
        ),
      )
      .returning({ id: tasks.id });
    return rows.length;
  }

  /** TK4: opens the rule's tasks for the records that qualify now — at most a batch per run. */
  async openTasks(options: { scope: TaskRuleScope; source: TaskRuleSource }): Promise<number> {
    const { scope, source } = options;
    if (!source.canOpen) return 0;
    const candidates = (await this.databaseHandle.execute(
      candidatesQuery(scope, source),
    )) as unknown as CandidateRow[];
    if (candidates.length === 0) return 0;
    const linkColumn = source.link ?? 'contact_id';
    const rows = await this.databaseHandle
      .insert(tasks)
      .values(
        candidates.map((candidate) => ({
          public_id: generatePublicId('task'),
          organization_id: scope.organizationId,
          kind: TASK_KIND.RULE,
          rule_key: source.rule,
          title: candidate.title.slice(0, 120),
          why: candidate.why?.slice(0, 280) ?? null,
          owner_membership_id: idOrNull(candidate.owner_membership_id),
          owner_role: candidate.owner_membership_id === null ? source.ownerRole : null,
          contact_id: idOrNull(candidate.contact_id),
          [linkColumn]: Number(candidate.record_id),
          branch_id: idOrNull(candidate.branch_id),
          due_at: new Date(candidate.due_at),
          priority: source.priority,
        })) as never,
      )
      .onConflictDoNothing()
      .returning({ id: tasks.id });
    return rows.length;
  }

  /** TK10: the open tasks of the rules the app handles here that have fallen due. */
  async findDueClinozySteps(options: {
    organizationId: number;
    rules: readonly TaskRule[];
  }): Promise<ClinozyStepTask[]> {
    if (options.rules.length === 0) return [];
    const rows = await this.databaseHandle
      .select({
        taskId: tasks.id,
        rule: tasks.rule_key,
        contactId: tasks.contact_id,
        firstName: contacts.first_name,
        areNoticesStopped: sql<boolean>`${contacts.notices_stopped_at} is not null`,
        branchId: tasks.branch_id,
        appointmentId: tasks.appointment_id,
        invoiceId: tasks.invoice_id,
        visitDate: sql<string | null>`to_char(${appointments.appointment_date}, 'DD Mon')`,
        visitTime: sql<string | null>`to_char(${appointments.start_time}, 'HH24:MI')`,
        reminderStatus: appointments.reminder_status,
        invoiceNumber: invoices.invoice_number,
        dueAmount: sql<string | null>`${invoices.due_amount}::text`,
      })
      .from(tasks)
      .leftJoin(contacts, eq(contacts.id, tasks.contact_id))
      .leftJoin(appointments, eq(appointments.id, tasks.appointment_id))
      .leftJoin(invoices, eq(invoices.id, tasks.invoice_id))
      .where(
        and(
          eq(tasks.organization_id, options.organizationId),
          eq(tasks.kind, TASK_KIND.RULE),
          eq(tasks.status, TASK_STATUS.OPEN),
          isNull(tasks.deleted_at),
          inArray(tasks.rule_key, [...options.rules]),
          lte(tasks.due_at, sql`now()`),
        ),
      )
      .orderBy(asc(tasks.due_at), asc(tasks.id))
      .limit(TASK_RULES_TASKS_PER_RULE);
    return rows.map((row) => ({ ...row, rule: row.rule as TaskRule }));
  }

  /**
   * A queued WhatsApp message from the app (no author) on the person's stream — the messaging
   * worker sends it — marked with what it is for (`automationKind`, D78). TK10's outreach moves
   * the contact's activity times and a `new` lead to `contacted`, as a person's send does (M7,
   * 5.10); a notice (`isNotice` — a booking message, a receipt) moves only the last activity, so
   * a question the person asked still waits for a person (the `reply` rule).
   */
  async queueClinozyMessage(options: {
    organizationId: number;
    contactId: number;
    body: string;
    link: ClinozyMessageLink;
    automationKind: ContactActivityAutomationKind;
    /** Its WhatsApp template's parameters, in order (D32). */
    templateParameters: readonly string[];
    isNotice?: boolean;
  }): Promise<void> {
    await this.databaseHandle.insert(contact_activities).values({
      public_id: generatePublicId('contactActivity'),
      organization_id: options.organizationId,
      contact_id: options.contactId,
      type: 'whatsapp',
      direction: 'sent',
      body: options.body.slice(0, 1000),
      delivery_status: 'queued',
      automation_kind: options.automationKind,
      template_parameters: [...options.templateParameters],
      ...options.link,
    } as never);
    const latest = (column: AnyPgColumn) =>
      sql`greatest(coalesce(${column}, '-infinity'::timestamptz), now())`;
    if (options.isNotice === true) {
      await this.databaseHandle
        .update(contacts)
        .set({ last_activity_at: latest(contacts.last_activity_at) } as never)
        .where(eq(contacts.id, options.contactId));
    } else {
      await this.databaseHandle
        .update(contacts)
        .set({
          last_activity_at: latest(contacts.last_activity_at),
          last_sent_at: latest(contacts.last_sent_at),
          default_channel: 'whatsapp',
        } as never)
        .where(eq(contacts.id, options.contactId));
      await this.databaseHandle
        .update(leads)
        .set({
          status: 'contacted',
          updated_at: sql`greatest(now(), ${leads.created_at})`,
        } as never)
        .where(
          and(
            eq(leads.contact_id, options.contactId),
            eq(leads.status, 'new'),
            isNull(leads.deleted_at),
          ),
        );
    }
  }

  /**
   * A booking message went into the queue (TK10 `confirm`, D78 WC-5, WC-6): the booking's reminder
   * status moves to `to` — only from one of `from`, so a write in between is never undone.
   */
  async markBookingMessageQueued(options: {
    appointmentId: number;
    from: readonly string[];
    to: string;
  }): Promise<void> {
    await this.databaseHandle
      .update(appointments)
      .set({ reminder_status: options.to } as never)
      .where(
        and(
          eq(appointments.id, options.appointmentId),
          inArray(appointments.reminder_status, [...options.from]),
        ),
      );
  }

  /**
   * TK10 `gone_quiet`: a re-target lead for the person (5, `retarget_reason`) — none when they have
   * an open lead already (L6); true when it opened one.
   */
  async openRetargetLead(options: {
    organizationId: number;
    contactId: number;
    branchId: number | null;
    reason: string;
  }): Promise<boolean> {
    const rows = await this.databaseHandle
      .insert(leads)
      .values({
        public_id: generatePublicId('lead'),
        organization_id: options.organizationId,
        contact_id: options.contactId,
        source: 'retarget',
        kind: 'retarget',
        retarget_reason: options.reason,
        branch_id: options.branchId,
      } as never)
      .onConflictDoNothing()
      .returning({ id: leads.id });
    return rows.length > 0;
  }

  /**
   * WC-17 (D35, D79): the patients whose last visit — checked in or completed — is at least
   * `afterDays` ago, who gave marketing consent, have nothing booked, no open lead and no
   * re-target lead since that visit; oldest visit first, a batch per run.
   */
  async findLapsedPatients(options: {
    organizationId: number;
    timeZone: string;
    afterDays: number;
  }): Promise<LapsedPatient[]> {
    const { organizationId, timeZone, afterDays } = options;
    const rows = (await this.databaseHandle.execute(sql`select ${contacts.id} as contact_id,
        last_visit.branch_id as branch_id
      from ${patients}
      join ${contacts} on ${contacts.id} = ${patients.contact_id}
      cross join lateral (
        select ${appointments.branch_id} as branch_id,
          ((${appointments.appointment_date} + ${appointments.start_time}) at time zone ${timeZone}) as visited_at
        from ${appointments}
        where ${appointments.contact_id} = ${contacts.id}
          and ${appointments.deleted_at} is null
          and ${appointments.status} in ('checked_in', 'completed')
        order by ${appointments.appointment_date} desc, ${appointments.start_time} desc
        limit 1
      ) as last_visit
      where ${patients.organization_id} = ${organizationId}
        and ${patients.deleted_at} is null
        and ${contacts.deleted_at} is null
        and ${contacts.has_marketing_consent}
        and last_visit.visited_at <= now() - make_interval(days => ${afterDays})
        and not exists (select 1 from ${appointments} as booked
          where booked.contact_id = ${contacts.id} and booked.deleted_at is null
            and booked.status in ('scheduled', 'confirmed'))
        and not exists (select 1 from ${leads} as open_lead
          where open_lead.contact_id = ${contacts.id} and open_lead.deleted_at is null
            and open_lead.status in (${sql.join(
              LEAD_OPEN_STATUS_VALUES.map((status) => sql`${status}`),
              sql`, `,
            )}))
        and not exists (select 1 from ${leads} as retargeted
          where retargeted.contact_id = ${contacts.id} and retargeted.kind = 'retarget'
            and retargeted.created_at >= last_visit.visited_at)
      order by last_visit.visited_at, ${contacts.id}
      limit ${TASK_RULES_TASKS_PER_RULE}`)) as unknown as {
      contact_id: string | number;
      branch_id: string | number | null;
    }[];
    return rows.map((row) => ({
      contactId: Number(row.contact_id),
      branchId: idOrNull(row.branch_id),
    }));
  }

  /** TK10: closes a task whose step the app took — done by the app, marked handled. */
  async closeTaskByClinozy(taskId: number): Promise<void> {
    await this.databaseHandle
      .update(tasks)
      .set(closedByClinozy({ isHandled: true }))
      .where(and(eq(tasks.id, taskId), eq(tasks.status, TASK_STATUS.OPEN)));
  }
}

/**
 * A task closed by the server (TK4, TK10): outcome `done`, done by the app, no resolver;
 * `isHandled` when the app took its step rather than its record changing.
 */
function closedByClinozy(options: { isHandled: boolean }): never {
  return {
    status: TASK_STATUS.DONE,
    outcome: TASK_OUTCOME.DONE,
    result_text: TASK_DONE_BY_CLINOZY,
    is_resolved_automatically: true,
    is_handled_by_clinozy: options.isHandled,
    resolved_at: sql`now()`,
    resolved_by_membership_id: null,
    snoozed_until: null,
    snooze_label: null,
    updated_at: sql`greatest(now(), ${tasks.created_at})`,
  } as never;
}

/**
 * A rule's candidates (TK4): its records that qualify and open now, without an open task of the
 * rule — nor one a person resolved, or whose step the app took (TK10), since the condition began
 * (`anchor_at`) — earliest due first. A task the app closed because its record changed keeps
 * nothing quiet: when the record qualifies again, a fresh task opens.
 */
function candidatesQuery(scope: TaskRuleScope, source: TaskRuleSource): SQL {
  const { columns } = source;
  const prefix = TASK_SOURCE_KEY_PREFIX[source.link ?? 'contact_id'];
  return sql`select * from (
    select ${source.recordId} as record_id,
      ${columns.contactId} as contact_id,
      ${columns.branchId} as branch_id,
      ${columns.ownerMembershipId} as owner_membership_id,
      ${source.due(sql`now()`)} as due_at,
      ${columns.title} as title,
      ${columns.why} as why,
      ${columns.anchorAt} as anchor_at
    from ${source.from}
    where ${source.organizationColumn} = ${scope.organizationId}
      and ${source.qualifies} and ${source.opens}
  ) as candidate
  where not exists (select 1 from ${tasks}
      where ${tasks.organization_id} = ${scope.organizationId}
        and ${tasks.rule_key} = ${source.rule}
        and ${tasks.source_key} = ${prefix} || ':' || candidate.record_id
        and ${tasks.deleted_at} is null
        and (${tasks.status} <> ${TASK_STATUS.DONE}
          or ((not ${tasks.is_resolved_automatically} or ${tasks.is_handled_by_clinozy})
            and ${tasks.created_at} >= candidate.anchor_at)))
  order by candidate.due_at, candidate.record_id
  limit ${TASK_RULES_TASKS_PER_RULE}`;
}

/** Worker-only factory — a handle pinned to one organization's context (TK4). */
export function createWorkerTaskRulesRepository(
  databaseHandle: WorkerDatabaseHandle,
): TaskRulesRepository {
  assertWorkerDatabaseContext(['organization']);
  return new TaskRulesRepository(databaseHandle);
}
