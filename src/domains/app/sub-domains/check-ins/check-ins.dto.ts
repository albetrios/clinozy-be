import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { CHECK_IN_FEEL_VALUES, CHECK_IN_FOLLOWED_VALUES } from './check-ins.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Path params of the by-id `check-ins` routes. */
export const checkInsIdParamsDto = z
  .object({
    check_in_id: recordIdSchema,
  })
  .strict();

/** Path params of the `check-ins` routes nested under their patient. */
export const checkInsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new check-in. */
export const CreateCheckInDto = z
  .object({
    appointment_id: recordIdSchema.nullable().optional(),
    treatment_id: recordIdSchema.nullable().optional(),
    context: trimmedStringMinMax(1, 80),
    feel: z.enum(CHECK_IN_FEEL_VALUES),
    score: z.number().int().min(1).max(10),
    followed: z.enum(CHECK_IN_FOLLOWED_VALUES).nullable().optional(),
    followed_note: trimmedStringMinMax(1, 280).nullable().optional(),
    current_state: trimmedStringMinMax(1, 500).nullable().optional(),
    next_plan: trimmedStringMinMax(1, 500).nullable().optional(),
    next_offering_ids: z
      .array(recordIdSchema)
      .max(10)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    check_in_date: calendarDateSchema,
  })
  .strict();

/** Body of `PATCH /app/check-ins/{check_in_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateCheckInDto = z
  .object({
    appointment_id: recordIdSchema.nullable().optional(),
    treatment_id: recordIdSchema.nullable().optional(),
    context: trimmedStringMinMax(1, 80).optional(),
    feel: z.enum(CHECK_IN_FEEL_VALUES).optional(),
    score: z.number().int().min(1).max(10).optional(),
    followed: z.enum(CHECK_IN_FOLLOWED_VALUES).nullable().optional(),
    followed_note: trimmedStringMinMax(1, 280).nullable().optional(),
    current_state: trimmedStringMinMax(1, 500).nullable().optional(),
    next_plan: trimmedStringMinMax(1, 500).nullable().optional(),
    next_offering_ids: z
      .array(recordIdSchema)
      .max(10)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    check_in_date: calendarDateSchema.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `check-ins` list — keyset paging, `q` search, sort and filters. */
export const listCheckInsQueryDto = listSearchSortSchema(['created_at', 'check_in_date'] as const)
  .extend({
    feel: z.enum(CHECK_IN_FEEL_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateCheckInDto}. */
export type CreateCheckInInput = z.infer<typeof CreateCheckInDto>;
/** Parsed {@link UpdateCheckInDto}. */
export type UpdateCheckInInput = z.infer<typeof UpdateCheckInDto>;
