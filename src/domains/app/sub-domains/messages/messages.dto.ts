import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  MESSAGE_CHANNEL_VALUES,
  MESSAGE_DIRECTION_VALUES,
  MESSAGE_KIND_VALUES,
  MESSAGE_DELIVERY_STATUS_VALUES,
  MESSAGE_RECORD_TYPE_VALUES,
} from './messages.constants.js';

/** Path params of the by-id `messages` routes. */
export const messagesIdParamsDto = z
  .object({
    message_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new message. */
export const CreateMessageDto = z
  .object({
    lead_id: recordIdSchema.nullable().optional(),
    patient_id: recordIdSchema.nullable().optional(),
    medical_contact_id: recordIdSchema.nullable().optional(),
    channel: z.enum(MESSAGE_CHANNEL_VALUES).optional(),
    kind: z.enum(MESSAGE_KIND_VALUES).optional(),
    body: trimmedString().max(4096),
    message_template_id: recordIdSchema.nullable().optional(),
    attachment_keys: z.array(trimmedStringMinMax(1, 512)).max(5).optional(),
    reply_to_message_id: recordIdSchema.nullable().optional(),
    record_type: z.enum(MESSAGE_RECORD_TYPE_VALUES).nullable().optional(),
    record_id: trimmedStringMinMax(1, 28).nullable().optional(),
    task_id: recordIdSchema.nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/messages/{message_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateMessageDto = z
  .object({
    lead_id: recordIdSchema.nullable().optional(),
    patient_id: recordIdSchema.nullable().optional(),
    medical_contact_id: recordIdSchema.nullable().optional(),
    channel: z.enum(MESSAGE_CHANNEL_VALUES).optional(),
    kind: z.enum(MESSAGE_KIND_VALUES).optional(),
    body: trimmedString().max(4096).optional(),
    message_template_id: recordIdSchema.nullable().optional(),
    attachment_keys: z.array(trimmedStringMinMax(1, 512)).max(5).optional(),
    reply_to_message_id: recordIdSchema.nullable().optional(),
    record_type: z.enum(MESSAGE_RECORD_TYPE_VALUES).nullable().optional(),
    record_id: trimmedStringMinMax(1, 28).nullable().optional(),
    task_id: recordIdSchema.nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `messages` list — keyset paging, `q` search, sort and filters. */
export const listMessagesQueryDto = listSearchSortSchema(['created_at', 'sent_at'] as const)
  .extend({
    lead_id: recordIdSchema.optional(),
    patient_id: recordIdSchema.optional(),
    medical_contact_id: recordIdSchema.optional(),
    channel: z.enum(MESSAGE_CHANNEL_VALUES).optional(),
    direction: z.enum(MESSAGE_DIRECTION_VALUES).optional(),
    kind: z.enum(MESSAGE_KIND_VALUES).optional(),
    delivery_status: z.enum(MESSAGE_DELIVERY_STATUS_VALUES).optional(),
    sent_at_from: z.iso.datetime({ offset: true }).optional(),
    sent_at_to: z.iso.datetime({ offset: true }).optional(),
    task_id: recordIdSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Body of `POST /app/messages/batches`. */
export const batchesMessagesBodyDto = z
  .object({
    contact_ids: z.array(recordIdSchema).min(1).max(200),
    channel: z.enum(MESSAGE_CHANNEL_VALUES),
    body: trimmedStringMinMax(1, 4096),
    message_template_id: recordIdSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateMessageDto}. */
export type CreateMessageInput = z.infer<typeof CreateMessageDto>;
/** Parsed {@link UpdateMessageDto}. */
export type UpdateMessageInput = z.infer<typeof UpdateMessageDto>;
