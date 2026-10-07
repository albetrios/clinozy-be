import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedEmail, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  addEndAfterStartIssue,
  chipToneSchema,
  hourMinuteSchema,
  phoneNumberSchema,
  recordDeleteQuerySchema,
  workingDaysSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  MEMBERSHIP_COMMISSION_PERCENT_MAX,
  MEMBERSHIP_ROLE_IDS_MAX,
} from './membership.constants.js';

/** Zod schema for the `:membership_id` path param (get/get-permissions/update/delete membership). */
export const membershipIdParamsDto = z
  .object({
    membership_id: trimmedStringMinMax(1, 28),
  })
  .strict();

/** Up to {@link MEMBERSHIP_ROLE_IDS_MAX} distinct role ids, the main role first (D5). */
const roleIds = z
  .array(trimmedStringMinMax(1, 28))
  .min(1)
  .max(MEMBERSHIP_ROLE_IDS_MAX)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'Each role once' });

/** Branch ids the member works in (`brn_…`); `[]` for none. */
const branchIds = z
  .array(trimmedStringMinMax(1, 28))
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'Each branch once' });

/** The staff profile fields a create or update accepts (launch ROUTE #4, D3). */
const staffProfileFields = {
  phone: phoneNumberSchema.nullable().optional(),
  tone: chipToneSchema.optional(),
  branch_ids: branchIds.optional(),
  working_days: workingDaysSchema.optional(),
  work_starts_at: hourMinuteSchema.optional(),
  work_ends_at: hourMinuteSchema.optional(),
  commission_percent: z
    .number()
    .min(0)
    .max(MEMBERSHIP_COMMISSION_PERCENT_MAX)
    .multipleOf(0.01)
    .optional(),
};

/** Rejects working hours that end at or before they start, when both are given. */
function workEndsAfterStarts(
  value: { work_starts_at?: string | undefined; work_ends_at?: string | undefined },
  context: z.RefinementCtx,
): void {
  addEndAfterStartIssue({
    start: value.work_starts_at,
    end: value.work_ends_at,
    endField: 'work_ends_at',
    message: 'Working hours must end after they start',
    context,
  });
}

/**
 * Zod schema for the `POST /organization/memberships` request body — the
 * "Add member" action (REQ-1). Identifies the invitee by `email` (a new
 * address provisions a bare ACTIVE user; an existing one resolves to that
 * account), the roles by public id (`role_ids`, the main role first — D5), the
 * staff profile (launch ROUTE #4), and an optional invitation `expires_in_days`
 * (1–365, default 7). The membership is always created `INVITED`; the invitee is
 * emailed a token and becomes `ACTIVE` on accept.
 */
export const createMembershipDto = z
  .object({
    email: trimmedEmail(),
    role_ids: roleIds,
    expires_in_days: z.number().int().min(1).max(365).optional().default(7),
    ...staffProfileFields,
  })
  .strict()
  .superRefine(workEndsAfterStarts);

/**
 * Zod schema for the `PATCH /organization/memberships/:membership_id`
 * request body: the membership `status`, its roles (`role_ids` replaces the whole
 * list, main first) and any staff profile field (`branch_ids` replaces the whole
 * list; `phone: null` clears it). At least one field must be provided.
 */
export const updateMembershipDto = z
  .object({
    status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED']).optional(),
    role_ids: roleIds.optional(),
    ...staffProfileFields,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Send at least one field' })
  .superRefine(workEndsAfterStarts);

/**
 * Query of `DELETE /organization/memberships/:membership_id` — why the member is removed
 * (`reason`, and a `note` when the reason is `other`).
 */
export const deleteMembershipQueryDto = recordDeleteQuerySchema;

/**
 * Zod schema for the `GET /organization/memberships` list query: cursor pagination plus optional
 * `q` (free-text search over the member's email / first name / last name), `sort` (`name` |
 * `created_at`), and `order` (`asc` | `desc`). Brings memberships to parity with the roles / api-key
 * lists (`listSearchSortSchema`) so the FE can sort the members table server-side. `sort` / `order`
 * are `.optional()` (a defaulted param serializes as `required`, a breaking contract change); the
 * repository defaults to `created_at` ascending to preserve the pre-sort ordering. Sorting by `name`
 * orders by the member's `auth.users` display name and is resolved through a SECURITY DEFINER
 * function (that table is FORCE RLS — a plain join under organization-only context matches zero rows).
 */
export const listMembershipsQueryDto = listSearchSortSchema(['name', 'created_at'] as const);

/**
 * Zod schema for the `POST /organization/transfer-ownership` request
 * body. `new_owner_user_id` is the target user's public id.
 */
export const transferOwnershipDto = z
  .object({
    new_owner_user_id: trimmedStringMinMax(1, 28),
  })
  .strict();

/** Validated body inferred from {@link createMembershipDto}. */
export type CreateMembershipInput = z.infer<typeof createMembershipDto>;
/** Validated body inferred from {@link updateMembershipDto}. */
export type UpdateMembershipInput = z.infer<typeof updateMembershipDto>;
/** Validated query inferred from {@link deleteMembershipQueryDto}. */
export type DeleteMembershipQueryInput = z.infer<typeof deleteMembershipQueryDto>;
/** Validated query inferred from {@link listMembershipsQueryDto}. */
export type ListMembershipsQueryInput = z.infer<typeof listMembershipsQueryDto>;
/** Validated body inferred from {@link transferOwnershipDto}. */
export type TransferOwnershipInput = z.infer<typeof transferOwnershipDto>;
