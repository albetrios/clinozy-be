import { z } from 'zod';

/**
 * Zod schema for serializable post-commit dispatch tasks stored in Redis — persisted before the
 * HTTP response returns and replayed by the recovery sweeper if the request dies after commit.
 * Public handles only, never a bigserial: a task can outlive a restore that restarts the sequence.
 */
export const commitDispatchTaskSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('mail_outbox'),
    // The outbox row's token (`resend_idempotency_token`) — the mail job's handle.
    mailOutboxToken: z.uuid(),
    requestId: z.string().optional(),
  }),
  z.object({
    type: z.literal('notification'),
    // The notification's public id — its BullMQ job id (see enqueueNotification).
    notificationPublicId: z.string().min(1).max(28),
    organizationPublicId: z.string().min(1).max(28).nullable(),
    // The recipient — scopes the worker's read of a notification without an organization.
    userPublicId: z.string().min(1).max(28),
  }),
  z.object({
    type: z.literal('user_data_export'),
    exportPublicId: z.string().min(1).max(28),
    userPublicId: z.string().min(1).max(28),
  }),
]);

/** Discriminated union of durable post-commit side effects replayed after HTTP commit. */
export type CommitDispatchTask = z.infer<typeof commitDispatchTaskSchema>;
