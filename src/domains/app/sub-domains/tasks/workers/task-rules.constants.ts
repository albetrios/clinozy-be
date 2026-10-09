/** BullMQ cron queue that adds one task rules job per active team organization (TK4). */
export const TASK_RULES_SWEEP_QUEUE_NAME = 'task-rules-sweep';

/** How many organizations one read of the sweep pages through — it reads until none are left. */
export const TASK_RULES_SWEEP_BATCH = 500;

/** How many tasks one rule opens, and how many steps Clinozy takes, per organization run — the rest next run. */
export const TASK_RULES_TASKS_PER_RULE = 200;

/** Why a "Let Clinozy handle" `gone_quiet` opens a re-target lead (5, `retarget_reason`). */
export const TASK_RULES_GONE_QUIET_REASON = 'Sessions left; no visit in 30+ days';

/** How many booking messages and receipts of each kind one organization run queues (D78) — the rest next run. */
export const TASK_RULES_MESSAGES_PER_KIND = 200;
