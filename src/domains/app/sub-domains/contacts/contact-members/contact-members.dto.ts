import { z } from 'zod';
import { recordIdSchema } from '@/shared/utils/validation/record-fields.util.js';
import { CONTACT_MEMBERSHIP_IDS_MAX } from '@/domains/app/sub-domains/contacts/contacts.constants.js';

/** Path params of the contact members routes. */
export const contactMembersParamsDto = z
  .object({
    contact_id: recordIdSchema,
  })
  .strict();

/** Body of `PUT /app/contacts/{contact_id}/members` — the full list of who handles the person (CT11). */
export const ReplaceContactMembersDto = z
  .object({
    membership_ids: z
      .array(recordIdSchema)
      .max(CONTACT_MEMBERSHIP_IDS_MAX)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Each membership once' }),
  })
  .strict();

/** Parsed {@link ReplaceContactMembersDto}. */
export type ReplaceContactMembersInput = z.infer<typeof ReplaceContactMembersDto>;
