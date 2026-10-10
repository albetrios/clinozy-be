import { fieldValidationError } from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { UpdateUserSettingsDto, type UpdateUserSettingsInput } from './user-settings.dto.js';

/**
 * Validate the `PATCH /api/v1/users/me/settings` body against {@link UpdateUserSettingsDto}.
 * Throws `ValidationError` (`errors:invalidInput`) with flattened field errors on failure.
 *
 * @remarks
 * - **Notes:** `analytics_consent` and `analytics_consent_version` come together or not at all — a
 *   decision is proof of consent only with the policy version it answered (launch D85); either one
 *   alone is a 400 on `analytics_consent_version`.
 */
export function validateUpdateUserSettings(body: unknown): UpdateUserSettingsInput {
  const parsed = parseWithSchema(UpdateUserSettingsDto, body);
  if (
    (parsed.analytics_consent === undefined) !==
    (parsed.analytics_consent_version === undefined)
  ) {
    throw fieldValidationError({
      field: 'analytics_consent_version',
      messageKey: 'errors:validation.analyticsConsentWithVersion',
    });
  }
  return parsed;
}
