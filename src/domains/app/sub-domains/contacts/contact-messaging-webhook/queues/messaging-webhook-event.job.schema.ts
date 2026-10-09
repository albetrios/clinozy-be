import { z } from 'zod';
import { traceContextJobFieldsSchema } from '@/infrastructure/observability/tracing/trace-context-job-fields.schema.js';
import { dlqReplayJobFieldsSchema } from '@/infrastructure/queue/dlq/dlq-replay-job-fields.schema.js';

/**
 * Redis payload of a messaging webhook processing job (launch D77): the organization whose
 * stored callbacks to apply — the worker claims them itself.
 */
export const messagingWebhookEventJobDataSchema = z
  .object({
    organizationPublicId: z.string().min(1).max(64),
  })
  .extend(traceContextJobFieldsSchema.shape)
  .extend(dlqReplayJobFieldsSchema.shape);

/** Validated payload of a messaging webhook processing job. */
export type MessagingWebhookEventJobData = z.infer<typeof messagingWebhookEventJobDataSchema>;
