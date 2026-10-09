import { z } from 'zod';
import { traceContextJobFieldsSchema } from '@/infrastructure/observability/tracing/trace-context-job-fields.schema.js';
import { dlqReplayJobFieldsSchema } from '@/infrastructure/queue/dlq/dlq-replay-job-fields.schema.js';

/**
 * Redis payload of a patient ideas job (WC-47, D80): the organization whose stale patients to
 * refresh — the worker re-enters Postgres under its RLS context and reads them itself.
 */
export const patientIdeasJobDataSchema = z
  .object({
    organizationPublicId: z.string().min(1).max(64),
  })
  .extend(traceContextJobFieldsSchema.shape)
  .extend(dlqReplayJobFieldsSchema.shape);

/** Validated payload of a patient ideas job. */
export type PatientIdeasJobData = z.infer<typeof patientIdeasJobDataSchema>;
