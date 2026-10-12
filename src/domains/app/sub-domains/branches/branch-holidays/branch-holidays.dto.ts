import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `branch-holidays` routes. */
export const branchHolidaysIdParamsDto = z
  .object({
    branch_id: recordIdSchema,
    branch_holiday_id: recordIdSchema,
  })
  .strict();

/** Path params of the `branch-holidays` routes nested under their branch. */
export const branchHolidaysParentParamsDto = z
  .object({
    branch_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new branch holiday. */
export const CreateBranchHolidayDto = z
  .object({
    holiday_date: calendarDateSchema,
    label: trimmedStringMinMax({ min: 1, max: 60 }),
  })
  .strict();

/** Body of `PATCH /app/branches/{branch_id}/holidays/{branch_holiday_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateBranchHolidayDto = z
  .object({
    holiday_date: calendarDateSchema.optional(),
    label: trimmedStringMinMax({ min: 1, max: 60 }).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/** Query of the `branch-holidays` list — keyset paging, `q` search, sort and filters. */
export const listBranchHolidaysQueryDto = listSearchSortSchema([
  'created_at',
  'holiday_date',
] as const)
  .extend({
    holiday_date_from: calendarDateSchema.optional(),
    holiday_date_to: calendarDateSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateBranchHolidayDto}. */
export type CreateBranchHolidayInput = z.infer<typeof CreateBranchHolidayDto>;
/** Parsed {@link UpdateBranchHolidayDto}. */
export type UpdateBranchHolidayInput = z.infer<typeof UpdateBranchHolidayDto>;
