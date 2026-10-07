/** Allowed values of `tasks.kind`. */
export const TASK_KIND_VALUES = [
  'manual',
  'follow_up',
  'aftercare_call',
  'callback',
  'payment_reminder',
  'confirm_visit',
  'review_request',
] as const;

/** Allowed values of `tasks.rule_key` — The rule that made it. */
export const TASK_RULE_KEY_VALUES = [
  'reply',
  'failed_message',
  'follow_up',
  'call_back',
  'claim',
  'confirm',
  'arrive',
  'rebook',
  'feedback',
  'aftercare',
  'next_visit',
  'gone_quiet',
  'payment_due',
  'onboarding',
  'unhappy',
  'settle_by',
  'medical_rep_visit',
] as const;

/** Allowed values of `tasks.owner_role` — The role queue — where the task falls back when no one owns it. */
export const TASK_OWNER_ROLE_VALUES = [
  'admin',
  'doctor',
  'therapist',
  'front_desk',
  'counsellor',
  'pharmacist',
  'accountant',
  'marketing',
  'owner',
] as const;

/** Allowed values of `tasks.source_type`. */
export const TASK_SOURCE_TYPE_VALUES = [
  'lead',
  'appointment',
  'treatment',
  'check_in',
  'review',
  'invoice',
] as const;

/** Allowed values of `tasks.status`. */
export const TASK_STATUS_VALUES = ['open', 'snoozed', 'done'] as const;

/** Allowed values of `tasks.outcome`. */
export const TASK_OUTCOME_VALUES = [
  'log_check_in',
  'doing_well',
  'no_answer',
  'happy',
  'done',
] as const;

/** Allowed values of `tasks.priority`. */
export const TASK_PRIORITY_VALUES = ['low', 'normal', 'high'] as const;
