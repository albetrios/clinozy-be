/**
 * A person's answer to the analytics consent question (`auth.user_settings.analytics_consent`) —
 * the single source of truth for the `chk_user_settings_analytics_consent` CHECK and the settings
 * DTO enum.
 *
 * @remarks
 * - **Algorithm:** the object literal is the authority; {@link ANALYTICS_CONSENT_VALUES} derives the
 *   list the DTO enum is built from.
 * - **Notes:** launch D85. The decision is the person's, not the browser's: the frontend applies the
 *   saved one at sign-in and asks again when it is six months old or the policy version moves. Not
 *   answered yet is `null` on the wire, never a third value here.
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
