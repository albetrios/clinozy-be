import { MILLISECONDS_PER_MINUTE } from '@/shared/constants/ttl.constants.js';

/** BullMQ queue name — repeatable schedule: `src/infrastructure/queue/scheduler.ts`. */
export const WEBHOOK_DELIVERY_RECLAIM_QUEUE_NAME = 'webhook-delivery-reclaim';

/**
 * How long a delivery attempt may stay `PENDING` before the reclaim sweep re-enqueues it. A worker
 * claims an attempt (`PENDING → SENDING`) within seconds of its job starting; one still pending
 * after this either lost its job — the enqueue failed while Redis refused writes, or the process
 * died between the commit and the enqueue — or waits behind a backlog, where the re-enqueue is a
 * no-op.
 */
export const WEBHOOK_DELIVERY_RECLAIM_STALE_AFTER_MS = 5 * MILLISECONDS_PER_MINUTE;

/** Attempts re-enqueued per sweep, oldest first; a larger set drains over the following runs. */
export const WEBHOOK_DELIVERY_RECLAIM_BATCH_SIZE = 500;
