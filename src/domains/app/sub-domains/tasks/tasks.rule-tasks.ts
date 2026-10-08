import {
  addDaysToCalendarDate,
  calendarDateInTimeZone,
  instantInTimeZone,
} from '@/shared/utils/validation/record-fields.util.js';
import { TASK_OWNER_ROLE, TASK_RULE, type TaskRule } from './tasks.constants.js';
import { TasksRepository } from './tasks.repository.js';

/** The record columns a task may point at — at most one (TK5). */
export type TaskRecordLink =
  | 'lead_id'
  | 'appointment_id'
  | 'patient_treatment_id'
  | 'patient_check_in_id'
  | 'patient_review_id'
  | 'invoice_id'
  | 'pending_credit_id'
  | 'medical_rep_id';

/** Every record link, in the order `source_key` reads them. */
export const TASK_RECORD_LINK_VALUES: readonly TaskRecordLink[] = [
  'lead_id',
  'appointment_id',
  'patient_treatment_id',
  'patient_check_in_id',
  'patient_review_id',
  'invoice_id',
  'pending_credit_id',
  'medical_rep_id',
];

/** What one rule task says (routes-final 10.A.10). */
export interface RuleTaskInput {
  organizationId: number;
  rule: TaskRule;
  title: string;
  why: string | null;
  /** The owner; the role queue is kept only when there is none (TK6). */
  ownerMembershipId: number | null;
  ownerRole: string | null;
  contactId: number | null;
  link: Partial<Record<TaskRecordLink, number>>;
  branchId: number | null;
  dueAt: Date;
  priority?: 'low' | 'normal' | 'high';
  userId: number | null;
}

/**
 * TK4: opens a rule's task for a record unless one is open already — the unique open-task index
 * (`idx_tasks_open_rule_source`) makes it one per rule per record; true when it opened one.
 *
 * @remarks
 * - **Algorithm:** {@link TasksRepository.insertRuleTask} on the caller's unit of work (a write's
 *   transaction — a check-in, a review, a task's outcome).
 * - **Failure modes:** none beyond the insert.
 */
export async function openRuleTask(input: RuleTaskInput): Promise<boolean> {
  return new TasksRepository().insertRuleTask(input);
}

/** HH:MM on the organization's day `days` from today, as an instant (10.A.10's "11:00 that day"). */
export function organizationClock(options: {
  timeZone: string;
  days: number;
  time: string;
  now?: Date;
}): Date {
  const today = calendarDateInTimeZone(options.timeZone, options.now ?? new Date());
  return instantInTimeZone({
    date: addDaysToCalendarDate({ date: today, days: options.days }),
    time: options.time,
    timeZone: options.timeZone,
  });
}

/**
 * TR4 through the task rules (TK4): a doctor call-back for a check-in or review that needs action —
 * the visit's doctor, else the doctor queue; due in three hours for a check-in, four for a review.
 */
export async function openCallBackTask(options: {
  organizationId: number;
  contactId: number | null;
  link: { patient_check_in_id: number } | { patient_review_id: number };
  doctorMembershipId: number | null;
  branchId: number | null;
  title: string;
  why: string | null;
  userId: number | null;
}): Promise<boolean> {
  const hours = 'patient_check_in_id' in options.link ? 3 : 4;
  return openRuleTask({
    organizationId: options.organizationId,
    rule: TASK_RULE.CALL_BACK,
    title: options.title,
    why: options.why,
    ownerMembershipId: options.doctorMembershipId,
    ownerRole: TASK_OWNER_ROLE.DOCTOR,
    contactId: options.contactId,
    link: options.link,
    branchId: options.branchId,
    dueAt: new Date(Date.now() + hours * 3_600_000),
    priority: 'high',
    userId: options.userId,
  });
}
