import { z } from 'zod';
import { traceContextJobFieldsSchema } from '@/infrastructure/observability/tracing/trace-context-job-fields.schema.js';
import { dlqReplayJobFieldsSchema } from '@/infrastructure/queue/dlq/dlq-replay-job-fields.schema.js';

/**
 * Redis payload of a message delivery job (launch D77, WC-1): the organization whose queued
 * WhatsApp and Instagram messages to send — the worker claims them itself.
 */
export const contactMessageDeliveryJobDataSchema = z
  .object({
    organizationPublicId: z.string().min(1).max(64),
  })
  .extend(traceContextJobFieldsSchema.shape)
  .extend(dlqReplayJobFieldsSchema.shape);

/** Validated payload of a message delivery job. */
export type ContactMessageDeliveryJobData = z.infer<typeof contactMessageDeliveryJobDataSchema>;
