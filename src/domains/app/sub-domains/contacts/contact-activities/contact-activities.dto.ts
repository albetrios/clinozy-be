import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import { recordIdSchema, valueListSchema } from '@/shared/utils/validation/record-fields.util.js';
import {
  CONTACT_ACTIVITY_ATTACHMENTS_MAX,
  CONTACT_ACTIVITY_BATCH_CONTACTS_MAX,
  CONTACT_ACTIVITY_BODY_MAX,
  CONTACT_ACTIVITY_DELIVERY_STATUS_VALUES,
  CONTACT_ACTIVITY_DIRECTION_VALUES,
  CONTACT_ACTIVITY_GROUP_VALUES,
  CONTACT_ACTIVITY_LINK_COLUMNS,
  CONTACT_ACTIVITY_MESSAGE_TYPE_VALUES,
  CONTACT_ACTIVITY_TYPE_VALUES,
} from './contact-activities.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** An entry's text — 1–1000 (M6). */
const bodySchema = trimmedStringMinMax({ min: 1, max: CONTACT_ACTIVITY_BODY_MAX });

/** Up to five upload keys, each once — confirmed uploads of the organization (M6, D64). */
const attachmentKeysSchema = z
  .array(trimmedStringMinMax({ min: 1, max: 512 }))
  .max(CONTACT_ACTIVITY_ATTACHMENTS_MAX)
  .refine(distinct, { message: 'errors:validation.eachAttachmentOnce' });

/** The twelve optional record links (M5) — `con_`-style public ids of today's tables. */
const linkFields = Object.fromEntries(
  CONTACT_ACTIVITY_LINK_COLUMNS.map((column) => [column, recordIdSchema.optional()]),
) as Record<(typeof CONTACT_ACTIVITY_LINK_COLUMNS)[number], z.ZodOptional<typeof recordIdSchema>>;

/** M5: at most one record link — each extra one is a 400 on its own field. */
function atMostOneLink({
  value,
  context,
}: {
  value: Record<string, unknown>;
  context: z.RefinementCtx;
}): void {
  const named = CONTACT_ACTIVITY_LINK_COLUMNS.filter((column) => value[column] !== undefined);
  for (const column of named.slice(1)) {
    context.addIssue({
      code: 'custom',
      path: [column],
      message: 'errors:validation.taskOneRecord',
    });
  }
}

/** Path params of the stream routes (`/contacts/{contact_id}/activities`). */
export const contactActivitiesParentParamsDto = z
  .object({
    contact_id: recordIdSchema,
  })
  .strict();

/** Path params of the by-id stream routes. */
export const contactActivitiesIdParamsDto = z
  .object({
    contact_id: recordIdSchema,
    contact_activity_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST …/activities/send-message` (routes-final 4.C.8 #11): a WhatsApp or Instagram
 * message — sent, queued for the messaging worker (M8).
 */
export const SendContactMessageDto = z
  .object({
    type: z.enum(CONTACT_ACTIVITY_MESSAGE_TYPE_VALUES),
    body: bodySchema,
    contact_message_template_id: recordIdSchema.optional(),
    attachment_keys: attachmentKeysSchema.optional(),
    reply_to_contact_activity_id: recordIdSchema.optional(),
    ...linkFields,
  })
  .strict()
  .superRefine((value, context) => atMostOneLink({ value, context }));

/** Body of `POST …/activities/log-call` (4.C.8 #12): a call that happened, either way. */
export const LogContactCallDto = z
  .object({
    direction: z.enum(CONTACT_ACTIVITY_DIRECTION_VALUES),
    body: bodySchema,
    reply_to_contact_activity_id: recordIdSchema.optional(),
    ...linkFields,
  })
  .strict()
  .superRefine((value, context) => atMostOneLink({ value, context }));

/** Body of `POST …/activities/add-note` (4.C.8 #13): an internal note — never sent. */
export const AddContactNoteDto = z
  .object({
    body: bodySchema,
    attachment_keys: attachmentKeysSchema.optional(),
    ...linkFields,
  })
  .strict()
  .superRefine((value, context) => atMostOneLink({ value, context }));

/** Body of `POST /contact-activities/message-batches` (4.C.8 #16): one message to many contacts. */
export const ContactMessageBatchDto = z
  .object({
    contact_ids: z
      .array(recordIdSchema)
      .min(1)
      .max(CONTACT_ACTIVITY_BATCH_CONTACTS_MAX)
      .refine(distinct, { message: 'errors:validation.eachContactOnce' }),
    type: z.enum(CONTACT_ACTIVITY_MESSAGE_TYPE_VALUES),
    body: bodySchema,
    contact_message_template_id: recordIdSchema.optional(),
  })
  .strict();

/**
 * Query of a contact's stream (routes-final 4.C.8 #10) — `group` and `type` (several,
 * comma-separated), `direction`, `delivery_status`, `task_id`, `appointment_id`,
 * `occurred_at_from` / `occurred_at_to`, `q` on the text; sort `occurred_at` (default, oldest
 * first) | `created_at`.
 */
export const listContactActivitiesQueryDto = listSearchSortSchema([
  'occurred_at',
  'created_at',
] as const)
  .extend({
    group: valueListSchema(CONTACT_ACTIVITY_GROUP_VALUES).optional(),
    type: valueListSchema(CONTACT_ACTIVITY_TYPE_VALUES).optional(),
    direction: z.enum(CONTACT_ACTIVITY_DIRECTION_VALUES).optional(),
    delivery_status: z.enum(CONTACT_ACTIVITY_DELIVERY_STATUS_VALUES).optional(),
    task_id: recordIdSchema.optional(),
    appointment_id: recordIdSchema.optional(),
    occurred_at_from: z.iso.datetime({ offset: true }).optional(),
    occurred_at_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link ContactMessageBatchDto}. */
export type ContactMessageBatchInput = z.infer<typeof ContactMessageBatchDto>;
