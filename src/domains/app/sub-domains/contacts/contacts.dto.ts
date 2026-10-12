import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  phoneNumberSchema,
  recordIdListSchemaOf,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  CONTACT_DEFAULT_CHANNEL_VALUES,
  CONTACT_GENDER_VALUES,
  CONTACT_IDS_MAX,
  CONTACT_INSTAGRAM_HANDLES_MAX,
  CONTACT_PHONES_MAX,
  CONTACT_PHONES_MIN,
  CONTACT_PREFERENCE_TAG_PATTERN,
  CONTACT_PREFERENCE_TAGS_MAX,
  CONTACT_REFERRAL_SOURCE_VALUES,
} from './contacts.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** One preference tag — a lowercase snake_case key (CT14). */
const preferenceTagSchema = z
  .string()
  .regex(new RegExp(CONTACT_PREFERENCE_TAG_PATTERN), 'errors:validation.lowercaseKey');

/** The tag body without its anchors, for the comma-separated list filter. */
const TAG_BODY = CONTACT_PREFERENCE_TAG_PATTERN.slice(1, -1);

/** One number of a contact (routes-final 4.A.6 Contact phone). */
const contactPhoneSchema = z
  .object({
    phone: phoneNumberSchema,
    is_primary: z.boolean().default(false),
    is_on_whatsapp: z.boolean().default(true),
  })
  .strict();

/** A contact's numbers: 1–5, each once, exactly one primary (CT2). */
const contactPhonesSchema = z
  .array(contactPhoneSchema)
  .min(CONTACT_PHONES_MIN)
  .max(CONTACT_PHONES_MAX)
  .refine((phones) => distinct(phones.map((entry) => entry.phone)), {
    message: 'errors:validation.eachNumberOnce',
  })
  .refine((phones) => phones.filter((entry) => entry.is_primary).length === 1, {
    message: 'errors:validation.exactlyOnePrimaryNumber',
  });

/** The fields a contact is written with — every one optional; create and update narrow it. */
const contactFields = {
  first_name: trimmedStringMinMax({ min: 1, max: 60 }),
  last_name: trimmedStringMinMax({ min: 1, max: 60 }).nullable(),
  gender: z.enum(CONTACT_GENDER_VALUES).nullable(),
  date_of_birth: calendarDateSchema.nullable(),
  phones: contactPhonesSchema,
  email: trimmedStringMinMax({ min: 3, max: 120 }).pipe(z.email()).nullable(),
  address: trimmedStringMinMax({ min: 1, max: 240 }).nullable(),
  instagram_handles: z
    .array(trimmedStringMinMax({ min: 1, max: 30 }))
    .max(CONTACT_INSTAGRAM_HANDLES_MAX)
    .refine(distinct, { message: 'errors:validation.eachHandleOnce' }),
  default_channel: z.enum(CONTACT_DEFAULT_CHANNEL_VALUES),
  preference_tags: z
    .array(preferenceTagSchema)
    .max(CONTACT_PREFERENCE_TAGS_MAX)
    .refine(distinct, { message: 'errors:validation.eachTagOnce' }),
  has_marketing_consent: z.boolean(),
  referral_source: z.enum(CONTACT_REFERRAL_SOURCE_VALUES).nullable(),
  referred_by_contact_id: recordIdSchema.nullable(),
  referred_by_name: trimmedStringMinMax({ min: 1, max: 120 }).nullable(),
};

/** Path params of the by-id `contacts` routes. */
export const contactsIdParamsDto = z
  .object({
    contact_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/contacts` — a new contact (routes-final 4.A.8 #2): `first_name` and 1–5
 * `phones` with exactly one primary; `household_contact_id` puts it in that contact's household
 * (absent = its own, CT3).
 */
export const CreateContactDto = z
  .object({
    first_name: contactFields.first_name,
    phones: contactFields.phones,
    last_name: contactFields.last_name.optional(),
    gender: contactFields.gender.optional(),
    date_of_birth: contactFields.date_of_birth.optional(),
    referral_source: contactFields.referral_source.optional(),
    referred_by_contact_id: contactFields.referred_by_contact_id.optional(),
    referred_by_name: contactFields.referred_by_name.optional(),
    email: contactFields.email.optional(),
    address: contactFields.address.optional(),
    instagram_handles: contactFields.instagram_handles.optional(),
    default_channel: contactFields.default_channel.optional(),
    preference_tags: contactFields.preference_tags.optional(),
    has_marketing_consent: contactFields.has_marketing_consent.optional(),
    household_contact_id: recordIdSchema.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/contacts/{contact_id}` — any field of the create (at least one; null clears
 * an optional one); `phones` replaces the set; `household_contact_id` null = its own household;
 * `expected_updated_at` refuses a stale save (D43).
 */
export const UpdateContactDto = z
  .object({
    first_name: contactFields.first_name.optional(),
    phones: contactFields.phones.optional(),
    last_name: contactFields.last_name.optional(),
    gender: contactFields.gender.optional(),
    date_of_birth: contactFields.date_of_birth.optional(),
    referral_source: contactFields.referral_source.optional(),
    referred_by_contact_id: contactFields.referred_by_contact_id.optional(),
    referred_by_name: contactFields.referred_by_name.optional(),
    email: contactFields.email.optional(),
    address: contactFields.address.optional(),
    instagram_handles: contactFields.instagram_handles.optional(),
    default_channel: contactFields.default_channel.optional(),
    preference_tags: contactFields.preference_tags.optional(),
    has_marketing_consent: contactFields.has_marketing_consent.optional(),
    household_contact_id: recordIdSchema.nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/**
 * Query of `GET /app/contacts` (routes-final 4.A.8 #1) — keyset paging, `q` (names, email,
 * Instagram, any number, a contact number such as `C-12345`, a patient's or a lead's number such as
 * `#2371`, a patient number such as `PT-0412` — SHELL-M1), sort `name` (default; best match
 * first while `q` is set) | `created_at` | `last_activity_at`, and the filters: `phone` (every
 * contact with that number), `ids` (up to 100, CT12), `is_patient`, `has_open_lead`,
 * `is_awaiting_reply`, `member_membership_id`, `household_contact_id`, `preference_tags` (several,
 * comma-separated — any of).
 */
export const listContactsQueryDto = listSearchSortSchema([
  'name',
  'created_at',
  'last_activity_at',
] as const)
  .extend({
    phone: phoneNumberSchema.optional(),
    ids: recordIdListSchemaOf(CONTACT_IDS_MAX)
      .meta({ example: 'con_a1b2c3d4e5f6g7h8i9j0k,con_k0j9i8h7g6f5e4d3c2b1a' })
      .optional(),
    is_patient: z.enum(['true', 'false']).optional(),
    has_open_lead: z.enum(['true', 'false']).optional(),
    is_awaiting_reply: z.enum(['true', 'false']).optional(),
    member_membership_id: recordIdSchema.optional(),
    household_contact_id: recordIdSchema.optional(),
    preference_tags: z
      .string()
      .regex(
        new RegExp(`^${TAG_BODY}(,${TAG_BODY}){0,${CONTACT_PREFERENCE_TAGS_MAX - 1}}$`),
        `Up to ${CONTACT_PREFERENCE_TAGS_MAX} tags, comma-separated`,
      )
      .meta({
        description: `Several: up to ${CONTACT_PREFERENCE_TAGS_MAX} preference tags, comma-separated — a contact with any of them.`,
        example: 'no_calls,after_six_pm',
      })
      .optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateContactDto}. */
export type CreateContactInput = z.infer<typeof CreateContactDto>;
/** Parsed {@link UpdateContactDto}. */
export type UpdateContactInput = z.infer<typeof UpdateContactDto>;
/** Parsed {@link listContactsQueryDto}. */
export type ListContactsQuery = z.infer<typeof listContactsQueryDto>;
