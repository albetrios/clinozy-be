/** The words a confirming reply starts with (WC-8, D78). */
const CONFIRMING_FIRST_WORDS: ReadonlySet<string> = new Set([
  'yes',
  'y',
  'yeah',
  'yep',
  'confirm',
  'confirmed',
  'ok',
  'okay',
]);

/** Words that turn a "yes" into something else — a person must read it. */
const HEDGING_WORDS: ReadonlySet<string> = new Set([
  'no',
  'not',
  'cant',
  'cannot',
  'cancel',
  'reschedule',
  'change',
  'move',
  'but',
  'later',
  'late',
]);

/** The most words a confirming reply has ("Yes, see you then"). */
const CONFIRMING_REPLY_WORDS_MAX = 5;

/**
 * Whether a WhatsApp reply confirms a booking (launch D78, WC-8) — "Reply YES to confirm".
 *
 * @remarks
 * - **Algorithm:** lower-cased, apostrophes dropped, everything but letters turned into spaces;
 *   a confirmation starts with `yes`, `y`, `yeah`, `yep`, `confirm`, `confirmed`, `ok` or `okay`,
 *   has at most five words and none of `no`, `not`, `cant`, `cannot`, `cancel`, `reschedule`,
 *   `change`, `move`, `but`, `later`, `late` — so "Yes 👍" and "ok see you" confirm, "yes but can
 *   we move it" does not.
 * - **Notes:** English only, as the messages that ask are.
 */
export function isConfirmationReply(text: string): boolean {
  const words = text
    .toLowerCase()
    .replaceAll(/['’]/g, '')
    .replaceAll(/[^a-z]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0);
  const [first] = words;
  return (
    first !== undefined &&
    CONFIRMING_FIRST_WORDS.has(first) &&
    words.length <= CONFIRMING_REPLY_WORDS_MAX &&
    !words.some((word) => HEDGING_WORDS.has(word))
  );
}

/** The replies that stop the clinic's automated WhatsApp messages (Meta's opt-out policy, D32). */
const STOP_REPLIES: ReadonlySet<string> = new Set([
  'stop',
  'stop all',
  'stop messages',
  'unsubscribe',
  'opt out',
  'optout',
]);

/** The replies that let them start again. */
const START_REPLIES: ReadonlySet<string> = new Set([
  'start',
  'unstop',
  'resume',
  'opt in',
  'optin',
]);

/** The reply as its plain words: lower-cased, everything but letters a single space. */
function plainWords(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z]+/g, ' ')
    .trim();
}

/**
 * Whether a WhatsApp reply asks the clinic to stop its automated messages (launch D32) — the
 * whole reply is `STOP`, `STOP ALL`, `STOP MESSAGES`, `UNSUBSCRIBE` or `OPT OUT`, in any case and
 * punctuation.
 *
 * @remarks
 * - **Notes:** the whole reply, so "please don't stop the treatment" stops nothing; English only,
 *   as the notices are.
 */
export function isStopReply(text: string): boolean {
  return STOP_REPLIES.has(plainWords(text));
}

/**
 * Whether a WhatsApp reply lets the clinic's automated messages start again — the whole reply is
 * `START`, `UNSTOP`, `RESUME` or `OPT IN`.
 *
 * @remarks
 * - **Notes:** as {@link isStopReply}.
 */
export function isStartReply(text: string): boolean {
  return START_REPLIES.has(plainWords(text));
}
