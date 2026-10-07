import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  moneySchema,
  recordIdListSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { DAY_CLOSE_STATUS_VALUES } from './day-closes.constants.js';

/** Path params of the by-id `day-closes` routes. */
export const dayClosesIdParamsDto = z
  .object({
    day_close_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new day close. */
export const CreateDayCloseDto = z
  .object({
    branch_id: recordIdSchema,
    close_date: calendarDateSchema,
    opening_cash: moneySchema,
  })
  .strict();

/** Body of `PATCH /app/day-closes/{day_close_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateDayCloseDto = z
  .object({
    branch_id: recordIdSchema.optional(),
    close_date: calendarDateSchema.optional(),
    opening_cash: moneySchema.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `day-closes` list — keyset paging, `q` search, sort and filters. */
export const listDayClosesQueryDto = listSearchSortSchema(['created_at', 'close_date'] as const)
  .extend({
    branch_id: recordIdSchema.optional(),
    close_date_from: calendarDateSchema.optional(),
    close_date_to: calendarDateSchema.optional(),
    status: z.enum(DAY_CLOSE_STATUS_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
    branch_ids: recordIdListSchema.optional(),
  })
  .strict();

/** Body of `POST /app/day-closes/{day_close_id}/close`. */
export const closeDayCloseDto = z
  .object({
    counted_cash: moneySchema,
    difference_reason: trimmedStringMinMax(1, 280).optional(),
  })
  .strict();

/** Parsed {@link CreateDayCloseDto}. */
export type CreateDayCloseInput = z.infer<typeof CreateDayCloseDto>;
/** Parsed {@link UpdateDayCloseDto}. */
export type UpdateDayCloseInput = z.infer<typeof UpdateDayCloseDto>;
