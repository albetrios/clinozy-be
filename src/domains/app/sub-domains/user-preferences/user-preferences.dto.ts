import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  USER_PREFERENCE_PINNED_SECTIONS_VALUES,
  USER_PREFERENCE_THEME_VALUES,
  USER_PREFERENCE_PATIENT_FILE_PINS_VALUES,
} from './user-preferences.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Path params of the by-id `user-preferences` routes. */
export const userPreferencesIdParamsDto = z
  .object({
    user_preference_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new user preference. */
export const CreateUserPreferenceDto = z
  .object({
    pinned_sections: z
      .array(z.enum(USER_PREFERENCE_PINNED_SECTIONS_VALUES))
      .max(10)
      .refine(distinct, { message: 'Each value once' })
      .optional(),
    branch_filter_ids: z
      .array(recordIdSchema)
      .max(20)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    theme: z.enum(USER_PREFERENCE_THEME_VALUES).optional(),
    patient_file_pins: z
      .array(z.enum(USER_PREFERENCE_PATIENT_FILE_PINS_VALUES))
      .max(11)
      .refine(distinct, { message: 'Each value once' })
      .optional(),
    recent_picks: z.array(trimmedStringMinMax(1, 160)).max(60).optional(),
  })
  .strict();

/** Body of `PATCH /app/user-preferences/{user_preference_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateUserPreferenceDto = z
  .object({
    pinned_sections: z
      .array(z.enum(USER_PREFERENCE_PINNED_SECTIONS_VALUES))
      .max(10)
      .refine(distinct, { message: 'Each value once' })
      .optional(),
    branch_filter_ids: z
      .array(recordIdSchema)
      .max(20)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    theme: z.enum(USER_PREFERENCE_THEME_VALUES).optional(),
    patient_file_pins: z
      .array(z.enum(USER_PREFERENCE_PATIENT_FILE_PINS_VALUES))
      .max(11)
      .refine(distinct, { message: 'Each value once' })
      .optional(),
    recent_picks: z.array(trimmedStringMinMax(1, 160)).max(60).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `user-preferences` list — keyset paging, `q` search, sort and filters. */
export const listUserPreferencesQueryDto = listSearchSortSchema(['created_at'] as const)
  .extend({
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateUserPreferenceDto}. */
export type CreateUserPreferenceInput = z.infer<typeof CreateUserPreferenceDto>;
/** Parsed {@link UpdateUserPreferenceDto}. */
export type UpdateUserPreferenceInput = z.infer<typeof UpdateUserPreferenceDto>;
