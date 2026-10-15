import { z } from 'zod';
import { trimmedString } from '@/shared/utils/validation/validation.util.js';
import { recordIdSchema } from '@/shared/utils/validation/record-fields.util.js';
import { ANALYTICS_CONSENT_VALUES } from './user-settings.constants.js';

/**
 * Zod schema for the `PATCH /api/v1/users/me/settings` body. All fields are optional so callers
 * can update one toggle at a time; omitted fields keep their existing or default value (the
 * service performs an upsert merge with the stored row). `analytics_consent` and
 * `analytics_consent_version` come together (launch D85) — a receipt of an answer given while
 * signed in (change-cookie-consent CC2); the server stamps when. `default_organization_id` pins the
 * clinic that opens at sign-in (an `org_…` id the caller actively belongs to), or `null` returns to
 * the automatic default — the clinic used last (feat-choose-default-clinic CD3, CD5).
 */
export const UpdateUserSettingsDto = z
  .object({
    is_dark_mode_enabled: z.boolean().optional(),
    is_notifications_enabled: z.boolean().optional(),
    language: trimmedString().max(10).optional(),
    preferred_locales: z.array(trimmedString().max(10)).max(10).optional(),
    analytics_consent: z.enum(ANALYTICS_CONSENT_VALUES).optional(),
    analytics_consent_version: z.number().int().min(1).max(1000).optional(),
    default_organization_id: recordIdSchema
      .nullable()
      .optional()
      .describe(
        'The clinic (`org_…`) that opens at sign-in, or `null` for the clinic used last. Must be an active clinic the caller is an active member of.',
      ),
  })
  .strict();

/** Inferred body type from {@link UpdateUserSettingsDto}. */
export type UpdateUserSettingsInput = z.infer<typeof UpdateUserSettingsDto>;
