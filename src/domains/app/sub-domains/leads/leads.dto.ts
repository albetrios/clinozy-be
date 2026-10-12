import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdListSchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { CreateContactDto } from '@/domains/app/sub-domains/contacts/contacts.dto.js';
import {
  LEAD_INTERESTS_VALUES,
  LEAD_INVOLVED_MEMBERSHIPS_MAX,
  LEAD_KIND_VALUES,
  LEAD_NOTES_MAX,
  LEAD_OWNERSHIP_VALUES,
  LEAD_SOURCE_VALUES,
  LEAD_STATUS_VALUES,
} from './leads.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** The fields a lead is written with (5.8 #3, #5) — each optional; create and update narrow them. */
const leadFields = {
  status: z.enum(LEAD_STATUS_VALUES),
  source: z.enum(LEAD_SOURCE_VALUES).nullable(),
  interests: z
    .array(z.enum(LEAD_INTERESTS_VALUES))
    .max(LEAD_INTERESTS_VALUES.length)
    .refine(distinct, { message: 'errors:validation.eachInterestOnce' }),
  owner_membership_id: recordIdSchema.nullable(),
  involved_membership_ids: z
    .array(recordIdSchema)
    .max(LEAD_INVOLVED_MEMBERSHIPS_MAX)
    .refine(distinct, { message: 'errors:validation.eachTeamMemberOnce' }),
  follow_up_at: instantSchema.nullable(),
  branch_id: recordIdSchema.nullable(),
  notes: trimmedStringMinMax({ min: 1, max: LEAD_NOTES_MAX }).nullable(),
};

/** The owner is not also involved (the design's "assignee cannot also be involved"). */
const ownerNotInvolved = {
  check: (value: {
    owner_membership_id?: string | null | undefined;
    involved_membership_ids?: string[] | undefined;
  }) =>
    !(
      value.owner_membership_id &&
      (value.involved_membership_ids ?? []).includes(value.owner_membership_id)
    ),
  options: { path: ['involved_membership_ids'], message: 'errors:validation.ownerNotAlsoInvolved' },
};

/** Path params of the by-id `leads` routes. */
export const leadsIdParamsDto = z
  .object({
    lead_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/leads` (routes-final 5.8 #3): a lead for a contact — `contact_id`, **or** a
 * new `contact` (the Contact create body, 4.A route 2) written in the same transaction (L1).
 */
export const CreateLeadDto = z
  .object({
    contact_id: recordIdSchema.optional(),
    contact: CreateContactDto.optional(),
    status: leadFields.status.optional(),
    source: leadFields.source.optional(),
    interests: leadFields.interests.optional(),
    owner_membership_id: leadFields.owner_membership_id.optional(),
    involved_membership_ids: leadFields.involved_membership_ids.optional(),
    follow_up_at: leadFields.follow_up_at.optional(),
    branch_id: leadFields.branch_id.optional(),
    notes: leadFields.notes.optional(),
  })
  .strict()
  .refine((value) => (value.contact_id === undefined) !== (value.contact === undefined), {
    path: ['contact_id'],
    message: 'errors:validation.contactIdOrContactNotBoth',
  })
  .refine(ownerNotInvolved.check, ownerNotInvolved.options);

/**
 * Body of `PATCH /app/leads/{lead_id}` (5.8 #5): any of the fields (at least one; null clears an
 * optional one); `involved_membership_ids` replaces the set; `expected_updated_at` refuses a stale
 * save (D43).
 */
export const UpdateLeadDto = z
  .object({
    status: leadFields.status.optional(),
    source: leadFields.source.optional(),
    interests: leadFields.interests.optional(),
    owner_membership_id: leadFields.owner_membership_id.optional(),
    involved_membership_ids: leadFields.involved_membership_ids.optional(),
    follow_up_at: leadFields.follow_up_at.optional(),
    branch_id: leadFields.branch_id.optional(),
    notes: leadFields.notes.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  })
  .refine(ownerNotInvolved.check, ownerNotInvolved.options);

/**
 * Query of the leads list and export (routes-final 5.8 #1, #2, L7) — `q` (the contact's names,
 * numbers, contact number; the lead number `#2371`), `status` / `source` / `interests` (several,
 * comma-separated), `kind`, `contact_id`, `owner_membership_id`, `team_membership_id` (owner or
 * involved), `is_awaiting_reply`, `ownership`, `branch_id`, `branch_ids`, the follow-up and created
 * ranges; sort `created_at` (default, newest first) | `name` | `status` | `source` | `follow_up_at`
 * | `last_activity_at` — a sort on a column that can be empty keeps those rows, last. The saved-view
 * registry checks a view's `filters` against it.
 */
export const listLeadsQueryDto = listSearchSortSchema([
  'created_at',
  'name',
  'status',
  'source',
  'follow_up_at',
  'last_activity_at',
] as const)
  .extend({
    status: valueListSchema(LEAD_STATUS_VALUES).optional(),
    source: valueListSchema(LEAD_SOURCE_VALUES).optional(),
    interests: valueListSchema(LEAD_INTERESTS_VALUES).optional(),
    kind: z.enum(LEAD_KIND_VALUES).optional(),
    contact_id: recordIdSchema.optional(),
    owner_membership_id: recordIdSchema.optional(),
    team_membership_id: recordIdSchema.optional(),
    is_awaiting_reply: z.enum(['true', 'false']).optional(),
    ownership: z.enum(LEAD_OWNERSHIP_VALUES).optional(),
    branch_id: recordIdSchema.optional(),
    branch_ids: recordIdListSchema.optional(),
    follow_up_at_from: instantSchema.optional(),
    follow_up_at_to: instantSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateLeadDto}. */
export type CreateLeadInput = z.infer<typeof CreateLeadDto>;
/** Parsed {@link UpdateLeadDto}. */
export type UpdateLeadInput = z.infer<typeof UpdateLeadDto>;
