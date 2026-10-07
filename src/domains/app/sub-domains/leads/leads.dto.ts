import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  instantSchema,
  phoneNumberSchema,
  recordIdListSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  LEAD_STATUS_VALUES,
  LEAD_SOURCE_VALUES,
  LEAD_INTERESTS_VALUES,
  LEAD_KIND_VALUES,
  LEAD_DEFAULT_CHANNEL_VALUES,
} from './leads.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Path params of the by-id `leads` routes. */
export const leadsIdParamsDto = z
  .object({
    lead_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new lead. */
export const CreateLeadDto = z
  .object({
    name: trimmedStringMinMax(1, 120),
    phone: phoneNumberSchema,
    email: trimmedStringMinMax(3, 254).pipe(z.email()).nullable().optional(),
    status: z.enum(LEAD_STATUS_VALUES).nullable().optional(),
    source: z.enum(LEAD_SOURCE_VALUES).nullable().optional(),
    interests: z
      .array(z.enum(LEAD_INTERESTS_VALUES))
      .max(6)
      .refine(distinct, { message: 'Each value once' })
      .optional(),
    owner_membership_id: recordIdSchema.nullable().optional(),
    involved_membership_ids: z
      .array(recordIdSchema)
      .max(10)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    follow_up_at: instantSchema.nullable().optional(),
    branch_id: recordIdSchema.nullable().optional(),
    patient_id: recordIdSchema.nullable().optional(),
    notes: trimmedString().max(2000).nullable().optional(),
    phones: z.array(trimmedStringMinMax(1, 16)).max(5).optional(),
    instagram_handles: z.array(trimmedStringMinMax(1, 60)).max(5).optional(),
    default_channel: z.enum(LEAD_DEFAULT_CHANNEL_VALUES).nullable().optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
    household: trimmedStringMinMax(1, 240).nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/leads/{lead_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateLeadDto = z
  .object({
    name: trimmedStringMinMax(1, 120).optional(),
    phone: phoneNumberSchema.optional(),
    email: trimmedStringMinMax(3, 254).pipe(z.email()).nullable().optional(),
    status: z.enum(LEAD_STATUS_VALUES).nullable().optional(),
    source: z.enum(LEAD_SOURCE_VALUES).nullable().optional(),
    interests: z
      .array(z.enum(LEAD_INTERESTS_VALUES))
      .max(6)
      .refine(distinct, { message: 'Each value once' })
      .optional(),
    owner_membership_id: recordIdSchema.nullable().optional(),
    involved_membership_ids: z
      .array(recordIdSchema)
      .max(10)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    follow_up_at: instantSchema.nullable().optional(),
    branch_id: recordIdSchema.nullable().optional(),
    patient_id: recordIdSchema.nullable().optional(),
    notes: trimmedString().max(2000).nullable().optional(),
    phones: z.array(trimmedStringMinMax(1, 16)).max(5).optional(),
    instagram_handles: z.array(trimmedStringMinMax(1, 60)).max(5).optional(),
    default_channel: z.enum(LEAD_DEFAULT_CHANNEL_VALUES).nullable().optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
    household: trimmedStringMinMax(1, 240).nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `leads` list — keyset paging, `q` search, sort and filters. */
export const listLeadsQueryDto = listSearchSortSchema([
  'created_at',
  'name',
  'follow_up_at',
  'last_touch_at',
] as const)
  .extend({
    status: z.enum(LEAD_STATUS_VALUES).optional(),
    source: z.enum(LEAD_SOURCE_VALUES).optional(),
    owner_membership_id: recordIdSchema.optional(),
    follow_up_at_from: z.iso.datetime({ offset: true }).optional(),
    follow_up_at_to: z.iso.datetime({ offset: true }).optional(),
    branch_id: recordIdSchema.optional(),
    patient_id: recordIdSchema.optional(),
    is_contact_thread: z.enum(['true', 'false']).optional(),
    kind: z.enum(LEAD_KIND_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
    branch_ids: recordIdListSchema.optional(),
  })
  .strict();

/** Body of `POST /app/leads/{lead_id}/convert`. */
export const convertLeadDto = z
  .object({
    first_name: trimmedStringMinMax(1, 60).optional(),
    last_name: trimmedStringMinMax(1, 60).optional(),
    gender: z.enum(['female', 'male', 'other']).optional(),
    date_of_birth: calendarDateSchema.optional(),
    home_branch_id: recordIdSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateLeadDto}. */
export type CreateLeadInput = z.infer<typeof CreateLeadDto>;
/** Parsed {@link UpdateLeadDto}. */
export type UpdateLeadInput = z.infer<typeof UpdateLeadDto>;
