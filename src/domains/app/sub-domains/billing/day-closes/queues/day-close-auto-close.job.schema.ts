import { z } from 'zod';
import { traceContextJobFieldsSchema } from '@/infrastructure/observability/tracing/trace-context-job-fields.schema.js';
import { dlqReplayJobFieldsSchema } from '@/infrastructure/queue/dlq/dlq-replay-job-fields.schema.js';

/**
 * Redis payload of a day auto-close job (WC-39, B26): the organization whose past days to close —
 * the worker re-enters Postgres under its RLS context and reads what is due itself.
 */
export const dayCloseAutoCloseJobDataSchema = z
  .object({
    organizationPublicId: z.string().min(1).max(64),
  })
  .extend(traceContextJobFieldsSchema.shape)
  .extend(dlqReplayJobFieldsSchema.shape);

/** Validated payload of a day auto-close job. */
export type DayCloseAutoCloseJobData = z.infer<typeof dayCloseAutoCloseJobDataSchema>;
