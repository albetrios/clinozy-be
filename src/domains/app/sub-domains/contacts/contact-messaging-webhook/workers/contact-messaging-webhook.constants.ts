/** BullMQ cron queue: every minute, re-enqueues the organizations with unclaimed queued messages or pending callbacks (D77). */
export const CONTACT_MESSAGING_SWEEP_QUEUE_NAME = 'contact-messaging-sweep';

/** BullMQ cron queue: daily, removes stored callbacks past their 30 days (D77). */
export const MESSAGING_WEBHOOK_EVENT_RETENTION_QUEUE_NAME = 'messaging-webhook-event-retention';
