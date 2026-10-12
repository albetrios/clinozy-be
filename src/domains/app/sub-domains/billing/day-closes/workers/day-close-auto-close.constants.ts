/** BullMQ cron queue that finds the organizations with past days nobody closed (WC-39, B26). */
export const DAY_CLOSE_AUTO_CLOSE_SWEEP_QUEUE_NAME = 'day-close-auto-close-sweep';

/** How many organizations one sweep enqueues at most — the rest wait for the next hour. */
export const DAY_CLOSE_AUTO_CLOSE_SWEEP_BATCH = 500;

/** How many days one organization's job closes at most — the rest wait for the next job. */
export const DAY_CLOSE_AUTO_CLOSE_DAYS_PER_JOB = 200;

/** A day closes itself once the day after it has ended — two days before the organization's today. */
export const DAY_CLOSE_AUTO_CLOSE_AFTER_DAYS = 2;
