import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { taskRuleSources } from '@/domains/app/sub-domains/tasks/task-rule-conditions.repository.js';
import {
  type ClinozyStepTask,
  createWorkerTaskRulesRepository,
  type TaskRulesRepository,
  type TaskRuleSwitch,
} from '@/domains/app/sub-domains/tasks/task-rules.repository.js';
import {
  TASK_AUTOMATIC_RULE_VALUES,
  TASK_RULE,
  type TaskRule,
} from '@/domains/app/sub-domains/tasks/tasks.constants.js';
import { TASK_RULES_GONE_QUIET_REASON } from './task-rules.constants.js';

/**
 * What one organization's run did (the job's return value, logged as `task-rules.completed`).
 *
 * @remarks
 * - **Notes:** `wokenCount` — snoozed tasks open again; `closedCount` — tasks closed "Done by
 *   Clinozy" because their record changed; `openedCount` — new rule tasks; `handledCount` — steps
 *   "Let Clinozy handle" took.
 */
export interface TaskRulesRunCounts {
  wokenCount: number;
  closedCount: number;
  openedCount: number;
  handledCount: number;
}

/** A rule with no saved switch is on, by hand (TK10). */
function isOn(switches: Map<string, TaskRuleSwitch>, rule: TaskRule): boolean {
  return switches.get(rule)?.isOn ?? true;
}

/** The message Clinozy sends for a `confirm`, `payment_due` or `feedback` task (TK10). */
function clinozyMessageOf(step: ClinozyStepTask): {
  body: string;
  link: { appointment_id: number } | { invoice_id: number } | Record<string, never>;
} | null {
  const first = step.firstName ?? 'there';
  if (step.rule === TASK_RULE.CONFIRM && step.appointmentId !== null) {
    return {
      body: `Hi ${first}, this is a reminder of your visit on ${step.visitDate} at ${step.visitTime}. Reply YES to confirm.`,
      link: { appointment_id: step.appointmentId },
    };
  }
  if (step.rule === TASK_RULE.PAYMENT_DUE && step.invoiceId !== null) {
    return {
      body: `Hi ${first}, ₹${step.dueAmount} is still due on invoice ${step.invoiceNumber}. You can pay at your next visit, or reply here and we will help.`,
      link: { invoice_id: step.invoiceId },
    };
  }
  if (step.rule === TASK_RULE.FEEDBACK) {
    return {
      body: `Hi ${first}, thank you for visiting us. How was your visit? Reply with a number from 1 (poor) to 5 (great).`,
      link: step.appointmentId === null ? {} : { appointment_id: step.appointmentId },
    };
  }
  return null;
}

/**
 * TK10 "Let Clinozy handle": takes one due task's step — the confirmation, payment reminder or
 * review request on WhatsApp, or a re-target lead for `gone_quiet` — and closes it "Done by
 * Clinozy"; false (the task stays for a person) when there is nobody to message.
 */
async function takeClinozyStep(options: {
  repository: TaskRulesRepository;
  organizationId: number;
  step: ClinozyStepTask;
}): Promise<boolean> {
  const { repository, organizationId, step } = options;
  if (step.contactId === null) return false;
  if (step.rule === TASK_RULE.GONE_QUIET) {
    await repository.openRetargetLead({
      organizationId,
      contactId: step.contactId,
      branchId: step.branchId,
      reason: TASK_RULES_GONE_QUIET_REASON,
    });
  } else {
    const message = clinozyMessageOf(step);
    if (message === null) return false;
    await repository.queueClinozyMessage({ organizationId, contactId: step.contactId, ...message });
    if (step.rule === TASK_RULE.CONFIRM && step.appointmentId !== null)
      await repository.markConfirmRequested(step.appointmentId);
  }
  await repository.closeTaskByClinozy(step.taskId);
  return true;
}

/**
 * Runs one organization's task rules (TK4, TK7, TK10): wakes the snoozed tasks whose time came,
 * closes each rule's tasks whose record changed ("Done by Clinozy"), opens the tasks of the rules
 * that are on for the records that qualify, and takes the step of the due tasks Clinozy handles.
 *
 * @remarks
 * - **Algorithm:** inside the organization's context (one transaction): per rule (10.A.10, in the
 *   Rules popover's order) close first, then open — so a moved record's task closes and its fresh
 *   one opens in the same run. A rule that is off opens nothing (its open tasks are hidden from
 *   the list, TK10) but its tasks still close when their record changes. Then the due tasks of the
 *   rules set to "Let Clinozy handle" (and on) take their step. At most a batch per rule per run —
 *   the next run picks up the rest.
 * - **Failure modes:** a database error rolls the whole run back and propagates, so BullMQ retries;
 *   running it twice opens nothing twice (one open task per rule per record, TK4).
 * - **Side effects:** inserts and updates on `app.tasks`; for Clinozy's steps, queued WhatsApp
 *   entries on `app.contact_activities` (with the contact's activity times), a booking's reminder
 *   status, re-target leads on `app.leads`.
 */
export async function runTaskRulesJob(
  databaseHandle: WorkerDatabaseHandle,
  organizationPublicId: string,
): Promise<TaskRulesRunCounts> {
  const repository = createWorkerTaskRulesRepository(databaseHandle);
  const organization = await repository.findOrganization(organizationPublicId);
  const counts: TaskRulesRunCounts = {
    wokenCount: 0,
    closedCount: 0,
    openedCount: 0,
    handledCount: 0,
  };
  if (organization === null) return counts;
  const scope = { organizationId: organization.id, timeZone: organization.timeZone };
  counts.wokenCount = await repository.wakeSnoozed(organization.id);
  const switches = await repository.findRuleSwitches(organization.id);
  for (const source of taskRuleSources(scope)) {
    counts.closedCount += await repository.closeGoneTasks({
      organizationId: organization.id,
      source,
    });
    if (isOn(switches, source.rule))
      counts.openedCount += await repository.openTasks({ scope, source });
  }
  const handledRules = TASK_AUTOMATIC_RULE_VALUES.filter(
    (rule) => isOn(switches, rule) && switches.get(rule)?.isAutomatic === true,
  );
  for (const step of await repository.findDueClinozySteps({
    organizationId: organization.id,
    rules: handledRules,
  })) {
    if (await takeClinozyStep({ repository, organizationId: organization.id, step }))
      counts.handledCount += 1;
  }
  logger.info({ organizationPublicId, ...counts }, 'task-rules.completed');
  return counts;
}
