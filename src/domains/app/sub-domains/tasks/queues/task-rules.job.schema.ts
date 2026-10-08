import { z } from 'zod';
import { traceContextJobFieldsSchema } from '@/infrastructure/observability/tracing/trace-context-job-fields.schema.js';
import { dlqReplayJobFieldsSchema } from '@/infrastructure/queue/dlq/dlq-replay-job-fields.schema.js';

/**
 * Redis payload of a task rules job (TK4): the organization whose rules to run — the worker
 * re-enters Postgres under its RLS context and reads what qualifies itself.
 */
export const taskRulesJobDataSchema = z
  .object({
    organizationPublicId: z.string().min(1).max(64),
  })
  .extend(traceContextJobFieldsSchema.shape)
  .extend(dlqReplayJobFieldsSchema.shape);

/** Validated payload of a task rules job. */
export type TaskRulesJobData = z.infer<typeof taskRulesJobDataSchema>;
