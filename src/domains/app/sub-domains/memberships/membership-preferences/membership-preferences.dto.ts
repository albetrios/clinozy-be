import { z } from 'zod';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  MEMBERSHIP_PREFERENCE_BRANCH_IDS_MAX,
  MEMBERSHIP_PREFERENCE_PATIENT_FILE_PINS_VALUES,
  MEMBERSHIP_PREFERENCE_PINNED_SECTIONS_MAX,
  MEMBERSHIP_PREFERENCE_PINNED_SECTIONS_VALUES,
  MEMBERSHIP_PREFERENCE_RECENT_PICKS_MAX,
  MEMBERSHIP_PREFERENCE_THEME_VALUES,
} from './membership-preferences.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** One `recent_picks` entry: `room:field:value` (the dropdowns' "Recent" group). */
const recentPickSchema = z
  .string()
  .trim()
  .max(160)
  .regex(/^[^:]+:[^:]+:.+$/, { message: 'Each entry is room:field:value' });

/**
 * Body of `PATCH /app/memberships/me/preferences` (launch §2.F, U4) — at least one field; each list
 * sent replaces the saved one; `expected_updated_at` refuses a stale save (optional — the screens
 * save silently and retry).
 */
export const updateMembershipPreferencesDto = z
  .object({
    pinned_sections: z
      .array(z.enum(MEMBERSHIP_PREFERENCE_PINNED_SECTIONS_VALUES))
      .max(MEMBERSHIP_PREFERENCE_PINNED_SECTIONS_MAX)
      .refine(distinct, { message: 'Each value once' })
      .optional(),
    theme: z.enum(MEMBERSHIP_PREFERENCE_THEME_VALUES).optional(),
    branch_ids: z
      .array(recordIdSchema)
      .max(MEMBERSHIP_PREFERENCE_BRANCH_IDS_MAX)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    patient_file_pins: z
      .array(z.enum(MEMBERSHIP_PREFERENCE_PATIENT_FILE_PINS_VALUES))
      .max(MEMBERSHIP_PREFERENCE_PATIENT_FILE_PINS_VALUES.length)
      .refine(distinct, { message: 'Each value once' })
      .optional(),
    recent_picks: z.array(recentPickSchema).max(MEMBERSHIP_PREFERENCE_RECENT_PICKS_MAX).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Parsed {@link updateMembershipPreferencesDto}. */
export type UpdateMembershipPreferencesInput = z.infer<typeof updateMembershipPreferencesDto>;
