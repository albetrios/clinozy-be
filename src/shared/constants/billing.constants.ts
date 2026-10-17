/** Billing and Stripe integration defaults. */

/**
 * Stripe webhook events stuck in `processing` may be reclaimed after this lease (minutes) — the
 * upper bound on one legitimate processing run (a Stripe API read plus the local writes).
 */
export const STRIPE_WEBHOOK_STUCK_PROCESSING_LEASE_MINUTES = 15;

/**
 * Processing attempts after which a Stripe webhook event is abandoned: the ledger row turns
 * `abandoned`, the reclaim sweep stops retrying it, and one alert fires. Counts only attempts in
 * which our handler ran (a Stripe outage fails before the claim and costs none) — five BullMQ
 * attempts per reclaim cycle, so about five cycles of a handler that fails every time.
 */
export const STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS = 25;

/**
 * Upper bound on the failed-event tally surfaced by the reclaim worker's
 * `stripe_webhook_events_failed_count` gauge (audit #15). The count query stops
 * scanning at this many `failed` rows so a pathological backlog (e.g. a
 * prolonged Stripe outage that fails millions of events) can never turn the
 * periodic gauge refresh into an unbounded sequential scan. The gauge only
 * drives a "failed rows are lingering" alert, so any value at or above the cap
 * is operationally equivalent.
 */
export const STRIPE_WEBHOOK_FAILED_COUNT_CAP = 10_000;

/**
 * A new clinic's trial: the days a TEAM organization that has never paid keeps writing in the clinic
 * rooms, counted from its `created_at`. Past it, with `BILLING_READ_ONLY_ENFORCED` on, the clinic is
 * read-only until it pays (owner decision D3, 2026-10-17). A lapsed paid subscription has its own
 * grace instead — `BILLING_DUNNING_GRACE_DAYS` after its `current_period_end`.
 *
 * @remarks
 * Matches the lapse grace's default (14) so every unpaid clinic gets the same two weeks. Shorter
 * turns new clinics read-only before they finish setting up; longer gives a non-paying clinic full
 * use for longer — either applies at once to every clinic still counting from `created_at`.
 * Rationale and review date: `src/POLICIES.md` (NEW_ORGANIZATION_TRIAL_DAYS).
 */
export const NEW_ORGANIZATION_TRIAL_DAYS = 14;
