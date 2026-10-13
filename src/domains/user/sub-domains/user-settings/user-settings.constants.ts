/**
 * A person's answer to the analytics consent question (`auth.user_settings.analytics_consent`) —
 * the single source of truth for the `chk_user_settings_analytics_consent` CHECK and the settings
 * DTO enum.
 *
 * @remarks
 * - **Algorithm:** the object literal is the authority; {@link ANALYTICS_CONSENT_VALUES} derives the
 *   list the DTO enum is built from.
 * - **Notes:** launch D85, re-scoped by iteration `change-cookie-consent-2026-10-13-fmal` (CC1–CC2):
 *   the stored decision is a **receipt** of the last answer given while signed in. The browser's
 *   own cookie (claude.com's model, owned by the frontend) decides what runs; signing in never
 *   reads this back and signing out never clears it. Not answered yet is `null` on the wire, never
 *   a third value here.
 */
export const ANALYTICS_CONSENT = {
  GRANTED: 'granted',
  DENIED: 'denied',
} as const;

/** Literal union of {@link ANALYTICS_CONSENT} values. */
export type AnalyticsConsent = (typeof ANALYTICS_CONSENT)[keyof typeof ANALYTICS_CONSENT];

/** All analytics consent values, used to derive the DTO enum. */
export const ANALYTICS_CONSENT_VALUES = Object.values(ANALYTICS_CONSENT) as [
  AnalyticsConsent,
  ...AnalyticsConsent[],
];
