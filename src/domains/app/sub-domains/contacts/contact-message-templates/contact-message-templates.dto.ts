import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { CONTACT_ACTIVITY_BODY_MAX } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';
import { CONTACT_MESSAGE_TEMPLATE_TYPE_VALUES } from './contact-message-templates.constants.js';

/** Path params of the by-id `contact-message-templates` routes. */
export const contactMessageTemplatesIdParamsDto = z
  .object({
    contact_message_template_id: recordIdSchema,
  })
  .strict();

/** Body of `POST /app/contact-message-templates` — a template (routes-final 4.D.8 #18). */
export const CreateContactMessageTemplateDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: 60 }),
    body: trimmedStringMinMax({ min: 1, max: CONTACT_ACTIVITY_BODY_MAX }),
    type: z.enum(CONTACT_MESSAGE_TEMPLATE_TYPE_VALUES).optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/contact-message-templates/{contact_message_template_id}` — any of `name`,
 * `body`, `type`; `expected_updated_at` refuses a stale save (D43).
 */
export const UpdateContactMessageTemplateDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: 60 }).optional(),
    body: trimmedStringMinMax({ min: 1, max: CONTACT_ACTIVITY_BODY_MAX }).optional(),
    type: z.enum(CONTACT_MESSAGE_TEMPLATE_TYPE_VALUES).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Query of the templates list (routes-final 4.D.8 #17) — `q` on the name, `type`, sort
 * `created_at` (default, newest first) | `name`.
 */
export const listContactMessageTemplatesQueryDto = listSearchSortSchema([
  'created_at',
  'name',
] as const)
  .extend({
    type: z.enum(CONTACT_MESSAGE_TEMPLATE_TYPE_VALUES).optional(),
  })
  .strict();

/** Parsed {@link CreateContactMessageTemplateDto}. */
export type CreateContactMessageTemplateInput = z.infer<typeof CreateContactMessageTemplateDto>;
/** Parsed {@link UpdateContactMessageTemplateDto}. */
export type UpdateContactMessageTemplateInput = z.infer<typeof UpdateContactMessageTemplateDto>;
