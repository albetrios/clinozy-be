/** A task's kind (TK6): a rule's, a follow-up set on resolve, or one added by hand. */
export const TASK_KIND = {
  RULE: 'rule',
  FOLLOW_UP: 'follow_up',
  MANUAL: 'manual',
} as const;

/** Allowed values of `tasks.kind`. */
export const TASK_KIND_VALUES = [TASK_KIND.RULE, TASK_KIND.FOLLOW_UP, TASK_KIND.MANUAL] as const;

/** The kinds people make — the only ones changed or deleted by hand (TK7, TK9). */
export const TASK_HAND_KIND_VALUES = [TASK_KIND.FOLLOW_UP, TASK_KIND.MANUAL] as const;

/** The task rules (routes-final 10.A.10, + `medical_rep_visit` from 11, MD8) — each opens one task per record while its condition holds. */
export const TASK_RULE = {
  REPLY: 'reply',
  FAILED_MESSAGE: 'failed_message',
  FOLLOW_UP: 'follow_up',
  CLAIM: 'claim',
  CONFIRM: 'confirm',
  ARRIVE: 'arrive',
  REBOOK: 'rebook',
  FEEDBACK: 'feedback',
  AFTERCARE: 'aftercare',
  CALL_BACK: 'call_back',
  NEXT_VISIT: 'next_visit',
  GONE_QUIET: 'gone_quiet',
  PAYMENT_DUE: 'payment_due',
  SETTLE_BY: 'settle_by',
  MEDICAL_REP_VISIT: 'medical_rep_visit',
} as const;

/** Allowed values of `tasks.rule_key` and `task_rule_settings.rule_key`, in the Rules popover's order. */
export const TASK_RULE_VALUES = [
  TASK_RULE.REPLY,
  TASK_RULE.FAILED_MESSAGE,
  TASK_RULE.FOLLOW_UP,
  TASK_RULE.CLAIM,
  TASK_RULE.CONFIRM,
  TASK_RULE.ARRIVE,
  TASK_RULE.REBOOK,
  TASK_RULE.FEEDBACK,
  TASK_RULE.AFTERCARE,
  TASK_RULE.CALL_BACK,
  TASK_RULE.NEXT_VISIT,
  TASK_RULE.GONE_QUIET,
  TASK_RULE.PAYMENT_DUE,
  TASK_RULE.SETTLE_BY,
  TASK_RULE.MEDICAL_REP_VISIT,
] as const;

/** A task rule key. */
export type TaskRule = (typeof TASK_RULE_VALUES)[number];

/** The rules with a step Clinozy can take itself ("Let Clinozy handle", TK10). */
export const TASK_AUTOMATIC_RULE_VALUES = [
  TASK_RULE.CONFIRM,
  TASK_RULE.PAYMENT_DUE,
  TASK_RULE.FEEDBACK,
  TASK_RULE.GONE_QUIET,
] as const;

/** The role queues a task waits in when nobody owns it (TK6) — the preset roles' keys. */
export const TASK_OWNER_ROLE = {
  OWNER: 'owner',
  ADMIN: 'admin',
  DOCTOR: 'doctor',
  THERAPIST: 'therapist',
  FRONT_DESK: 'front_desk',
  COUNSELLOR: 'counsellor',
  PHARMACIST: 'pharmacist',
  ACCOUNTANT: 'accountant',
  MARKETING: 'marketing',
} as const;

/** Allowed values of `tasks.owner_role` and the owner-change roles. */
export const TASK_OWNER_ROLE_VALUES = [
  TASK_OWNER_ROLE.OWNER,
  TASK_OWNER_ROLE.ADMIN,
  TASK_OWNER_ROLE.DOCTOR,
  TASK_OWNER_ROLE.THERAPIST,
  TASK_OWNER_ROLE.FRONT_DESK,
  TASK_OWNER_ROLE.COUNSELLOR,
  TASK_OWNER_ROLE.PHARMACIST,
  TASK_OWNER_ROLE.ACCOUNTANT,
  TASK_OWNER_ROLE.MARKETING,
] as const;

/** A task's status (TK7). */
export const TASK_STATUS = {
  OPEN: 'open',
  SNOOZED: 'snoozed',
  DONE: 'done',
} as const;

/** Allowed values of `tasks.status`. */
export const TASK_STATUS_VALUES = [
  TASK_STATUS.OPEN,
  TASK_STATUS.SNOOZED,
  TASK_STATUS.DONE,
] as const;

/** The statuses a task can still be acted on in. */
export const TASK_OPEN_STATUS_VALUES = [TASK_STATUS.OPEN, TASK_STATUS.SNOOZED] as const;

/** The outcomes a task is resolved with — effect codes (TK7); the label is `result_text`. */
export const TASK_OUTCOME = {
  DONE: 'done',
  NO_ANSWER: 'no_answer',
  DOING_WELL: 'doing_well',
  LOG_CHECK_IN: 'log_check_in',
  HAPPY: 'happy',
  UNHAPPY: 'unhappy',
} as const;

/** Allowed values of `tasks.outcome`. */
export const TASK_OUTCOME_VALUES = [
  TASK_OUTCOME.DONE,
  TASK_OUTCOME.NO_ANSWER,
  TASK_OUTCOME.DOING_WELL,
  TASK_OUTCOME.LOG_CHECK_IN,
  TASK_OUTCOME.HAPPY,
  TASK_OUTCOME.UNHAPPY,
] as const;

/** The outcomes that need the task's person to have a patient file (TK7). */
export const TASK_PATIENT_OUTCOME_VALUES = [
  TASK_OUTCOME.DOING_WELL,
  TASK_OUTCOME.LOG_CHECK_IN,
] as const;

/** A task's priority. */
export const TASK_PRIORITY_VALUES = ['low', 'normal', 'high'] as const;

/** The Tasks tabs (10.A.8 #1). */
export const TASK_TAB = {
  OPEN: 'open',
  SNOOZED: 'snoozed',
  DONE: 'done',
} as const;

/** Allowed values of the list's `tab`. */
export const TASK_TAB_VALUES = [TASK_TAB.OPEN, TASK_TAB.SNOOZED, TASK_TAB.DONE] as const;

/** The list's scope (TK3): my tasks and my roles' queues, or everyone's. */
export const TASK_SCOPE_VALUES = ['mine', 'everyone'] as const;

/** How long a `no_answer` snoozes the task (TK7). */
export const TASK_NO_ANSWER_SNOOZE_HOURS = 3;

/** How many owner changes a task answers with (10.A.6). */
export const TASK_OWNER_CHANGES_SHOWN = 5;

/** The label a task closed by the server carries ("Done by Clinozy", TK4). */
export const TASK_DONE_BY_CLINOZY = 'Done by Clinozy';
