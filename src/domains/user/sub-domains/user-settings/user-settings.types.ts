import type { AnalyticsConsent } from './user-settings.constants.js';

/** API response shape for `GET /api/v1/users/me/settings` and the body of the patch response. */
export interface UserSettingsOutput {
  is_dark_mode_enabled: boolean;
  is_notifications_enabled: boolean;
  language: string;
  preferred_locales: string[];
  /**
   * The receipt of the last analytics answer given while signed in; `null` until one is given
   * (launch D85, change-cookie-consent CC2). The browser's cookie decides what runs.
   */
  analytics_consent: AnalyticsConsent | null;
  /** The consent policy version that answer was given to; `null` with `analytics_consent`. */
  analytics_consent_version: number | null;
  /** When it was given (ISO 8601, the server's time); `null` with `analytics_consent`. */
  analytics_consent_at: string | null;
  /**
   * The clinic pinned to open at sign-in (`org_…`); `null` for the automatic default — the clinic
   * used last — and also while a pinned clinic is not usable (membership ended or suspended, clinic
   * suspended or deleted; feat-choose-default-clinic CD7).
   */
  default_organization_id: string | null;
}
