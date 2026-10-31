import { z } from 'zod';
import { traceContextJobFieldsSchema } from '@/infrastructure/observability/tracing/trace-context-job-fields.schema.js';
import { dlqReplayJobFieldsSchema } from '@/infrastructure/queue/dlq/dlq-replay-job-fields.schema.js';

/**
 * Redis payload of a patient image thumbnail job: the photo and its organization — the worker
 * re-enters Postgres under the organization's RLS context and reads the row itself.
 */
export const patientImageThumbnailJobDataSchema = z
  .object({
    organizationPublicId: z.string().min(1).max(64),
    patientImagePublicId: z.string().min(1).max(64),
  })
  .extend(traceContextJobFieldsSchema.shape)
  .extend(dlqReplayJobFieldsSchema.shape);

/** Validated payload of a patient image thumbnail job. */
export type PatientImageThumbnailJobData = z.infer<typeof patientImageThumbnailJobDataSchema>;
