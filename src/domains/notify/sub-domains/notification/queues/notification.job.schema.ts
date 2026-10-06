import { z } from 'zod';
import { traceContextJobFieldsSchema } from '@/infrastructure/observability/tracing/trace-context-job-fields.schema.js';
import { dlqReplayJobFieldsSchema } from '@/infrastructure/queue/dlq/dlq-replay-job-fields.schema.js';

/**
 * Zod schema for `notification` BullMQ job payloads — validates the producer-supplied public ids
 * (the notification's, its organization's for tenant scoping — `null` for a notification without
 * one — and its recipient's, which scopes that case) plus the optional request id for log
 * correlation, before the worker reaches Postgres. Never a bigserial: a job outlives a restore
 * that restarts the sequence. Merges the W3C trace-context fields so API→worker spans stay
 * linked, and the shared DLQ replay metadata so notification jobs re-enqueued from the
 * dead-letter queue keep their replay provenance.
 */
export const notificationJobDataSchema = z
  .object({
    notificationPublicId: z.string().min(1).max(28),
    organizationPublicId: z.string().min(1).max(28).nullable(),
    userPublicId: z.string().min(1).max(28),
    requestId: z.string().min(1).max(128).optional(),
  })
  .extend(traceContextJobFieldsSchema.shape)
  .extend(dlqReplayJobFieldsSchema.shape);

/** Type inferred from {@link notificationJobDataSchema}; what the worker receives after parsing. */
export type NotificationJobDataValidated = z.infer<typeof notificationJobDataSchema>;
