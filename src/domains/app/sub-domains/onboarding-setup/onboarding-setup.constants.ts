/**
 * The clinic-setup drawer's steps in their order (feat-clinic-setup D14, D26) — what `next_step`
 * names: what kind of clinic, where it is, whether the owner sees patients, then going live.
 */
export const ONBOARDING_SETUP_STEP = {
  CLINIC_TYPE: 'clinic_type',
  LOCATION: 'location',
  YOU: 'you',
  GO_LIVE: 'go_live',
} as const;

/** One of {@link ONBOARDING_SETUP_STEP}. */
export type OnboardingSetupStep =
  (typeof ONBOARDING_SETUP_STEP)[keyof typeof ONBOARDING_SETUP_STEP];

/** The short guide's three items behind the profile icon, in their order (D28). */
export const ONBOARDING_SETUP_GUIDE_ITEM_VALUES = [
  'treatments',
  'invite_team',
  'first_appointment',
] as const;

/** One of {@link ONBOARDING_SETUP_GUIDE_ITEM_VALUES}. */
export type OnboardingSetupGuideItem = (typeof ONBOARDING_SETUP_GUIDE_ITEM_VALUES)[number];

/** The checks going live needs (D26) — each named when `POST …/complete` refuses. */
export const ONBOARDING_SETUP_LIVE_CHECK_VALUES = [
  'clinic_type',
  'main_branch',
  'services',
] as const;

/** One of {@link ONBOARDING_SETUP_LIVE_CHECK_VALUES}. */
export type OnboardingSetupLiveCheck = (typeof ONBOARDING_SETUP_LIVE_CHECK_VALUES)[number];

/** Active services that tick the guide's "Add your treatments" — the Consultation and one more (D28). */
export const ONBOARDING_SETUP_TREATMENTS_DONE_AT = 2;
