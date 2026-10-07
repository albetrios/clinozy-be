import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { MESSAGE_TEMPLATE_CHANNEL_VALUES } from './message-templates.constants.js';

/** Path params of the by-id `message-templates` routes. */
export const messageTemplatesIdParamsDto = z
  .object({
    message_template_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new message template. */
export const CreateMessageTemplateDto = z
  .object({
    name: trimmedStringMinMax(1, 60),
    body: trimmedString().max(1000),
    channel: z.enum(MESSAGE_TEMPLATE_CHANNEL_VALUES).optional(),
  })
  .strict();

/** Body of `PATCH /app/message-templates/{message_template_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateMessageTemplateDto = z
  .object({
    name: trimmedStringMinMax(1, 60).optional(),
    body: trimmedString().max(1000).optional(),
    channel: z.enum(MESSAGE_TEMPLATE_CHANNEL_VALUES).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `message-templates` list — keyset paging, `q` search, sort and filters. */
export const listMessageTemplatesQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    channel: z.enum(MESSAGE_TEMPLATE_CHANNEL_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateMessageTemplateDto}. */
export type CreateMessageTemplateInput = z.infer<typeof CreateMessageTemplateDto>;
/** Parsed {@link UpdateMessageTemplateDto}. */
export type UpdateMessageTemplateInput = z.infer<typeof UpdateMessageTemplateDto>;
