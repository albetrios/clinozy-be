import { z } from 'zod';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  CLINIC_TONE_VALUES,
  type ClinicTone,
  WEEKDAY_VALUES,
  type Weekday,
} from '@/shared/constants/clinic-record.constants.js';
import {
  BRANCH_GST_NUMBER_PATTERN,
  BRANCH_PHONE_PATTERN,
  BRANCH_POSTAL_CODE_PATTERN,
} from './branches.constants.js';

/** `HH:mm`, 00:00–23:59. */
const HOUR_MINUTE = /^([01]\d|2[0-3]):[0-5]\d$/;

const tone = z.enum(CLINIC_TONE_VALUES as [ClinicTone, ...ClinicTone[]]);
const weekday = z.enum(WEEKDAY_VALUES as [Weekday, ...Weekday[]]);
const hourMinute = z.string().trim().regex(HOUR_MINUTE, 'Use HH:mm');
const membershipPublicId = trimmedStringMinMax(1, 28);
const httpsLink = trimmedString()
  .max(512)
  .pipe(z.url().refine((url) => url.startsWith('https://'), { message: 'Link must use HTTPS' }));
const workingDays = z
  .array(weekday)
  .min(1)
  .max(WEEKDAY_VALUES.length)
  .refine((days) => new Set(days).size === days.length, { message: 'Each day once' });

/** Fields a create accepts (required ones without `.optional()`). */
const branchCreateFields = {
  name: trimmedStringMinMax(1, 60),
  tone: tone.optional(),
  is_main: z.boolean().optional(),
  address_line_one: trimmedStringMinMax(1, 120),
  address_line_two: trimmedString().max(120).nullable().optional(),
  area: trimmedStringMinMax(1, 60),
  city: trimmedStringMinMax(1, 60),
  state: trimmedStringMinMax(1, 60).optional(),
  postal_code: trimmedString().regex(new RegExp(BRANCH_POSTAL_CODE_PATTERN), 'Six digits'),
  phone: trimmedString().regex(new RegExp(BRANCH_PHONE_PATTERN), 'Use +91 and ten digits'),
  email: trimmedStringMinMax(3, 120).pipe(z.email()),
  gst_number: trimmedString()
    .regex(new RegExp(BRANCH_GST_NUMBER_PATTERN), 'Not a valid GSTIN')
    .nullable()
    .optional(),
  opens_at: hourMinute.optional(),
  closes_at: hourMinute.optional(),
  working_days: workingDays.optional(),
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
  if (value.opens_at && value.closes_at && value.closes_at <= value.opens_at) {
    context.addIssue({
      code: 'custom',
      path: ['closes_at'],
      message: 'Closing time must be after opening time',
    });
  }
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

/** Body of `POST /app/branches`. */
export const CreateBranchDto = z.object(branchCreateFields).strict().superRefine(closesAfterOpens);

/** Body of `PATCH /app/branches/{branch_id}` — any field, at least one. */
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
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Send at least one field' })
  .superRefine(closesAfterOpens);

/** Parsed {@link listBranchesQueryDto}. */
export type ListBranchesQueryInput = z.infer<typeof listBranchesQueryDto>;
/** Parsed {@link CreateBranchDto}. */
export type CreateBranchInput = z.infer<typeof CreateBranchDto>;
/** Parsed {@link UpdateBranchDto}. */
export type UpdateBranchInput = z.infer<typeof UpdateBranchDto>;
