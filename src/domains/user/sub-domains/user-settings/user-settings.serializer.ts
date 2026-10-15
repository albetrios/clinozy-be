import type { AnalyticsConsent } from './user-settings.constants.js';
import type { UserSettingsOutput } from './user-settings.types.js';

/** Minimal row projection accepted by {@link serializeUserSettings} (database row → API output). */
export interface UserSettingsRow {
  is_dark_mode_enabled: boolean;
  is_notifications_enabled: boolean;
  language: string;
  preferred_locales: unknown;
  analytics_consent: string | null;
  analytics_consent_version: number | null;
  analytics_consent_at: Date | null;
  /**
   * The pinned clinic's public id, resolved by the service only while the pin is usable; absent or
   * `null` reads as automatic.
   */
  default_organization_public_id?: string | null;
}

const DEFAULT_USER_SETTINGS: UserSettingsOutput = {
  is_dark_mode_enabled: false,
  is_notifications_enabled: true,
  language: 'en',
  preferred_locales: ['en'],
  analytics_consent: null,
  analytics_consent_version: null,
  analytics_consent_at: null,
  default_organization_id: null,
};

/**
 * Project a `user_settings` row into the public {@link UserSettingsOutput} shape, applying the
 * factory defaults when the row is missing so the API never returns "settings not found".
 */
export function serializeUserSettings(row: UserSettingsRow | null): UserSettingsOutput {
  if (!row)
    return {
      ...DEFAULT_USER_SETTINGS,
      preferred_locales: [...DEFAULT_USER_SETTINGS.preferred_locales],
    };
  return {
    is_dark_mode_enabled: row.is_dark_mode_enabled,
    is_notifications_enabled: row.is_notifications_enabled,
    language: row.language,
    preferred_locales: (row.preferred_locales as string[]) ?? [
      ...DEFAULT_USER_SETTINGS.preferred_locales,
    ],
    // The CHECK keeps the three null together or set together; the column only holds the enum's values.
    analytics_consent: (row.analytics_consent as AnalyticsConsent | null) ?? null,
    analytics_consent_version: row.analytics_consent_version ?? null,
    analytics_consent_at: row.analytics_consent_at?.toISOString() ?? null,
    default_organization_id: row.default_organization_public_id ?? null,
  };
}
