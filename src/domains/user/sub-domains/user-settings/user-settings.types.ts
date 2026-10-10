import type { AnalyticsConsent } from './user-settings.constants.js';

/** API response shape for `GET /api/v1/users/me/settings` and the body of the patch response. */
export interface UserSettingsOutput {
  is_dark_mode_enabled: boolean;
  is_notifications_enabled: boolean;
  language: string;
  preferred_locales: string[];
  /** The person's analytics consent; `null` until they first answer (launch D85). */
  analytics_consent: AnalyticsConsent | null;
  /** The consent policy version they answered; `null` with `analytics_consent`. */
  analytics_consent_version: number | null;
  /** When they answered (ISO 8601); `null` with `analytics_consent`. */
  analytics_consent_at: string | null;
}
