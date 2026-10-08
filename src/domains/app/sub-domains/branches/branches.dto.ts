import { z } from 'zod';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  addEndAfterStartIssue,
  phoneNumberSchema,
  chipToneSchema,
  expectedUpdatedAtSchema,
  gstNumberSchema,
  hourMinuteSchema,
  httpsLinkSchema,
  workingDaysSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { BRANCH_MEMBERSHIP_IDS_MAX, BRANCH_POSTAL_CODE_PATTERN } from './branches.constants.js';

const membershipPublicId = trimmedStringMinMax(1, 28);
const httpsLink = httpsLinkSchema(512);
/** Fields a create accepts (required ones without `.optional()`). */
const branchCreateFields = {
  name: trimmedStringMinMax(1, 60),
  tone: chipToneSchema.optional(),
  is_main: z.boolean().optional(),
  address_line_one: trimmedStringMinMax(1, 120),
  address_line_two: trimmedString().max(120).nullable().optional(),
  area: trimmedStringMinMax(1, 60),
  city: trimmedStringMinMax(1, 60),
  state: trimmedStringMinMax(1, 60).optional(),
  postal_code: trimmedString().regex(new RegExp(BRANCH_POSTAL_CODE_PATTERN), 'Six digits'),
  phone: phoneNumberSchema,
  email: trimmedStringMinMax(3, 120).pipe(z.email()),
  gst_number: gstNumberSchema.nullable().optional(),
  opens_at: hourMinuteSchema.optional(),
  closes_at: hourMinuteSchema.optional(),
  working_days: workingDaysSchema.optional(),
  default_doctor_membership_id: membershipPublicId.nullable().optional(),
  default_front_desk_membership_id: membershipPublicId.nullable().optional(),
  default_therapist_membership_id: membershipPublicId.nullable().optional(),
  default_pharmacist_membership_id: membershipPublicId.nullable().optional(),
  is_active: z.boolean().optional(),
  maps_link: httpsLink.nullable().optional(),
  review_link: httpsLink.nullable().optional(),
};

/** Rejects a closing time at or before the opening time when both are given. */
function closesAfterOpens(
  value: { opens_at?: string | undefined; closes_at?: string | undefined },
  context: z.RefinementCtx,
): void {
  addEndAfterStartIssue({
    start: value.opens_at,
    end: value.closes_at,
    endField: 'closes_at',
    message: 'Closing time must be after opening time',
    context,
  });
}

/** Path params of the by-id branch routes. */
export const branchIdParamsDto = z
  .object({
    branch_id: trimmedStringMinMax(1, 28),
  })
  .strict();

/** Query of `GET /app/branches`. */
export const listBranchesQueryDto = z
  .object({
    include_inactive: z.enum(['true', 'false']).optional().default('false'),
  })
  .strict();

/** Body of `POST /app/branches` — `membership_ids` are who works there from day one (D13). */
export const CreateBranchDto = z
  .object({
    ...branchCreateFields,
    membership_ids: z.array(membershipPublicId).max(BRANCH_MEMBERSHIP_IDS_MAX).optional(),
  })
  .strict()
  .superRefine(closesAfterOpens);

/**
 * Body of `PATCH /app/branches/{branch_id}` — any field, at least one; `expected_updated_at` refuses
 * a stale save (C12). Who works there changes through `PUT …/members` (D2).
 */
export const UpdateBranchDto = z
  .object({
    ...branchCreateFields,
    name: branchCreateFields.name.optional(),
    address_line_one: branchCreateFields.address_line_one.optional(),
    area: branchCreateFields.area.optional(),
    city: branchCreateFields.city.optional(),
    postal_code: branchCreateFields.postal_code.optional(),
    phone: branchCreateFields.phone.optional(),
    email: branchCreateFields.email.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  })
  .superRefine(closesAfterOpens);

/** Parsed {@link listBranchesQueryDto}. */
export type ListBranchesQueryInput = z.infer<typeof listBranchesQueryDto>;
/** Parsed {@link CreateBranchDto}. */
export type CreateBranchInput = z.infer<typeof CreateBranchDto>;
/** Parsed {@link UpdateBranchDto}. */
export type UpdateBranchInput = z.infer<typeof UpdateBranchDto>;
