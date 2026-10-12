/** The most ideas a patient's plan shows, stored or computed (routes-final 7.N, PI1). */
export const PATIENT_IDEAS_MAX = 4;

/** Which of the prototype's rules an idea came from (PI1). */
export const PATIENT_IDEA_SOURCE = {
  NOTE: 'note',
  HISTORY: 'history',
  CONSISTENCY: 'consistency',
  RENEW: 'renew',
  FIRST: 'first',
} as const;

/** One of {@link PATIENT_IDEA_SOURCE}'s values. */
export type PatientIdeaSource = (typeof PATIENT_IDEA_SOURCE)[keyof typeof PATIENT_IDEA_SOURCE];

/** How many visits make a package worth suggesting (PI1 — "a package saves on each session"). */
export const PATIENT_IDEAS_PACKAGE_VISITS = 2;

/** A package with at most this many sessions left is "almost used up" (PI1). */
export const PATIENT_IDEAS_RENEW_SESSIONS_LEFT = 1;

/** How many of the patient's clinical notes the rules read, newest first. */
export const PATIENT_IDEAS_NOTES_LIMIT = 60;

/** How many active offerings the rules choose from — the clinic's menu. */
export const PATIENT_IDEAS_OFFERINGS_LIMIT = 200;

/** The concerns a complaint or a diagnosis note names, by the words that name them (PI1). */
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
