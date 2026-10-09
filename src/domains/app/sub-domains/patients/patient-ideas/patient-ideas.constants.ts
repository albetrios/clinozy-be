/** The most ideas a patient's plan shows, stored or computed (routes-final 7.N, PI1). */
export const PATIENT_IDEAS_MAX = 4;

/** The longest reason an idea keeps. */
export const PATIENT_IDEA_REASON_MAX = 200;

/** Where an idea came from — Claude (`ai`) or one of the prototype's rules (PI1). */
export const PATIENT_IDEA_SOURCE = {
  AI: 'ai',
  NOTE: 'note',
  HISTORY: 'history',
  CONSISTENCY: 'consistency',
  RENEW: 'renew',
  FIRST: 'first',
} as const;

/** One of {@link PATIENT_IDEA_SOURCE}'s values. */
export type PatientIdeaSource = (typeof PATIENT_IDEA_SOURCE)[keyof typeof PATIENT_IDEA_SOURCE];

/** What the plan's ideas were built from (`meta.source`, PI2). */
export const PATIENT_IDEAS_ORIGIN = {
  AI: 'ai',
  RULES: 'rules',
} as const;

/** How many visits make a package worth suggesting (PI1 — "a package saves on each session"). */
export const PATIENT_IDEAS_PACKAGE_VISITS = 2;

/** A package with at most this many sessions left is "almost used up" (PI1). */
export const PATIENT_IDEAS_RENEW_SESSIONS_LEFT = 1;

/** How many stale patients one organization's refresh job takes (PI5) — the rest next run. */
export const PATIENT_IDEAS_REFRESH_BATCH = 20;

/** How many organizations one read of the ideas sweep pages through. */
export const PATIENT_IDEAS_SWEEP_BATCH = 500;

/** How many of each kind of history the summary for Claude carries (PI6). */
export const PATIENT_IDEAS_SUMMARY_LIMIT = 20;

/** How many active offerings the summary lists — the clinic's menu. */
export const PATIENT_IDEAS_OFFERINGS_LIMIT = 200;

/** The answer's token budget — four short ideas in JSON. */
export const PATIENT_IDEAS_MAX_TOKENS = 1024;

/**
 * The concerns a free-text complaint or diagnosis is reduced to before Claude sees it (PI6) — a
 * fixed vocabulary, so no word the team typed (a name, a number, a story) leaves the clinic.
 */
export const PATIENT_IDEAS_CONCERN_LABELS: readonly { label: string; words: RegExp }[] = [
  { label: 'pigmentation', words: /tan|pigment|melasma|pih|uneven|dark spot/i },
  { label: 'acne scars', words: /scar/i },
  { label: 'acne', words: /acne|pimple|breakout/i },
  { label: 'hair fall', words: /hair fall|hair loss|alopecia|thinning/i },
  { label: 'unwanted hair', words: /unwanted hair|facial hair|hirsut|laser hair|\blhr\b/i },
  { label: 'ageing', words: /wrinkle|fine line|ageing|aging|sagging/i },
  { label: 'dark circles', words: /dark circle/i },
  { label: 'dull skin', words: /dull|glow/i },
  { label: 'dandruff', words: /dandruff|flak/i },
  { label: 'dry skin', words: /dry skin|dryness/i },
];
