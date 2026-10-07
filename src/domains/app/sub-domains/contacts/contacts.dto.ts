import { z } from 'zod';
import { phoneNumberSchema, recordIdSchema } from '@/shared/utils/validation/record-fields.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';

/** The kinds of person a contact is. */
export const CONTACT_KIND_VALUES = ['patient', 'lead', 'medical_contact'] as const;

/**
 * Query of `GET /app/contacts` — a name, phone or number search (`q`), or who already has a
 * mobile (`phone`, the leads.1 warning — it never blocks); `kind` narrows to one kind.
 */
export const listContactsQueryDto = z
  .object({
    q: trimmedStringMinMax(1, 80)
      .refine((value) => value.length >= 3 || /^#?\d+$/.test(value), {
        message: 'At least 3 characters, or a number such as 42 or #42',
      })
      .optional(),
    phone: phoneNumberSchema.optional(),
    kind: z.enum(CONTACT_KIND_VALUES).optional(),
  })
  .strict()
  .refine((value) => (value.q === undefined) !== (value.phone === undefined), {
    message: 'Send q or phone',
  });

/** Path params of `GET /app/contacts/{contact_id}/preview` — a `pat_`, `lead_` or `mcon_` id. */
export const contactIdParamsDto = z
  .object({
    contact_id: recordIdSchema,
  })
  .strict();

/** Parsed {@link listContactsQueryDto}. */
export type ListContactsQueryInput = z.infer<typeof listContactsQueryDto>;
