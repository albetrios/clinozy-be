/**
 * Job name of the hourly seat reconcile — a repeatable job on the seat-sync queue
 * (`src/infrastructure/queue/scheduler.ts`), run by the seat-sync worker.
 */
export const SUBSCRIPTION_SEAT_RECONCILE_JOB_NAME = 'reconcile-subscription-seats';

/** Most organizations one reconcile pass handles per list — a larger backlog continues next hour. */
export const SUBSCRIPTION_SEAT_RECONCILE_BATCH_SIZE = 200;
