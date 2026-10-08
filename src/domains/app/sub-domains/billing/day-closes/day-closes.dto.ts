import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  moneySchema,
  recordIdListSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  DAY_CLOSE_OPENING_SOURCE,
  DAY_CLOSE_OPENING_SOURCE_VALUES,
  DAY_CLOSE_STATUS_VALUES,
} from './day-closes.constants.js';

/** Path params of the by-id day-close routes. */
export const dayClosesIdParamsDto = z
  .object({
    day_close_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/day-closes` (routes-final 8.E.8 #29) — open a branch's day: `branch_id*`
 * (one of yours); optional `close_date` (default the organization's today, up to 120 days back),
 * `opening_source` (`carried` default — the last close's count — or `recounted`), `opening_cash`
 * (a recount's, required then and only then).
 */
export const CreateDayCloseDto = z
  .object({
    branch_id: recordIdSchema,
    close_date: calendarDateSchema.optional(),
    opening_source: z.enum(DAY_CLOSE_OPENING_SOURCE_VALUES).optional(),
    opening_cash: moneySchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const recounted = value.opening_source === DAY_CLOSE_OPENING_SOURCE.RECOUNTED;
    if (recounted === (value.opening_cash === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['opening_cash'],
        message: recounted ? 'Required for a recount' : 'Only for a recount',
      });
    }
  });

/** Body of `POST /app/day-closes/{day_close_id}/close` (8.E.8 #31): the count, and why it differs. */
export const CloseDayCloseDto = z
  .object({
    counted_cash: moneySchema,
    difference_reason: trimmedStringMinMax(1, 280).optional(),
  })
  .strict();

/** Body of `POST /app/day-closes/{day_close_id}/reopen` (8.E.8 #32): why. */
export const ReopenDayCloseDto = z
  .object({
    reason: trimmedStringMinMax(1, 280),
  })
  .strict();

/**
 * Query of the day-close list (8.E.8 #28): the branch (several), the status, the dates
 * (inclusive); sort `close_date` (default, newest first) | `created_at`.
 */
export const listDayClosesQueryDto = listSearchSortSchema(['close_date', 'created_at'] as const)
  .omit({ q: true })
  .extend({
    branch_id: recordIdListSchema.optional(),
    status: z.enum(DAY_CLOSE_STATUS_VALUES).optional(),
    close_date_from: calendarDateSchema.optional(),
    close_date_to: calendarDateSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateDayCloseDto}. */
export type CreateDayCloseInput = z.infer<typeof CreateDayCloseDto>;
