import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  LEAD_MESSAGE_CHANNEL_VALUES,
  LEAD_MESSAGE_DELIVERY_STATUS_VALUES,
} from './lead-messages.constants.js';

/** Path params of the by-id `lead-messages` routes. */
export const leadMessagesIdParamsDto = z
  .object({
    lead_message_id: recordIdSchema,
  })
  .strict();

/** Path params of the `lead-messages` routes nested under their lead. */
export const leadMessagesParentParamsDto = z
  .object({
    lead_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new lead message. */
export const CreateLeadMessageDto = z
  .object({
    channel: z.enum(LEAD_MESSAGE_CHANNEL_VALUES).optional(),
    body: trimmedString().max(1000),
    record_type: trimmedStringMinMax(1, 30).nullable().optional(),
    record_id: trimmedStringMinMax(1, 28).nullable().optional(),
    task_id: recordIdSchema.nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/lead-messages/{lead_message_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateLeadMessageDto = z
  .object({
    channel: z.enum(LEAD_MESSAGE_CHANNEL_VALUES).optional(),
    body: trimmedString().max(1000).optional(),
    record_type: trimmedStringMinMax(1, 30).nullable().optional(),
    record_id: trimmedStringMinMax(1, 28).nullable().optional(),
    task_id: recordIdSchema.nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `lead-messages` list — keyset paging, `q` search, sort and filters. */
export const listLeadMessagesQueryDto = listSearchSortSchema(['created_at', 'sent_at'] as const)
  .extend({
    channel: z.enum(LEAD_MESSAGE_CHANNEL_VALUES).optional(),
    delivery_status: z.enum(LEAD_MESSAGE_DELIVERY_STATUS_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Body of `POST /app/lead-messages/batches`. */
export const batchesLeadMessagesBodyDto = z
  .object({
    lead_ids: z.array(recordIdSchema).min(1).max(200),
    channel: z.enum(LEAD_MESSAGE_CHANNEL_VALUES),
    body: trimmedStringMinMax(1, 1000),
  })
  .strict();

/** Parsed {@link CreateLeadMessageDto}. */
export type CreateLeadMessageInput = z.infer<typeof CreateLeadMessageDto>;
/** Parsed {@link UpdateLeadMessageDto}. */
export type UpdateLeadMessageInput = z.infer<typeof UpdateLeadMessageDto>;
