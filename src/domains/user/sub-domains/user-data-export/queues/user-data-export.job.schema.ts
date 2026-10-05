import { z } from 'zod';
import { traceContextJobFieldsSchema } from '@/infrastructure/observability/tracing/trace-context-job-fields.schema.js';

/**
 * Zod schema for the `user-data-export` BullMQ job payload — the export's and its owner's public
 * ids, never a bigserial (a job outlives a restore that restarts the sequence; the worker reads the
 * owner's internal id inside the owner's scope). Validated on enqueue and on worker pickup (via
 * `parseJobDataOrDeadLetter`) so a malformed job fails fast in the DLQ instead of silently
 * corrupting an export. Merges the W3C trace-context fields so the export worker span links back
 * to the originating request.
 */
export const userDataExportJobDataSchema = z
  .object({
    exportPublicId: z.string().min(1).max(28),
    userPublicId: z.string().min(1).max(28),
  })
  .extend(traceContextJobFieldsSchema.shape);

/** Inferred BullMQ job payload type for the `user-data-export` queue. */
export type UserDataExportJobData = z.infer<typeof userDataExportJobDataSchema>;
