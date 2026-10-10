`src/domains/billing/sub-domains/subscription/`

# Subscription

Parent: [billing](../../billing.overview.md)

## Purpose

The organization's active subscription record. One row per organization, bound to a Stripe customer and Stripe subscription. State changes always flow Stripe webhook → service → DB; we never write subscription state to DB without a Stripe-confirmed webhook behind it.

## Key invariants

- **One subscription per organization**: enforced at the service layer; concurrent create attempts resolve to a single Stripe subscription via the forwarded idempotency key.
- **State changes are Stripe-driven**: `subscriptions.status` only transitions in response to a webhook event whose `event.created_at` is newer than the row's last update.
- **Stale-event rejection**: out-of-order webhooks are rejected so state cannot roll backward.
- **Network I/O outside RLS contexts**: Stripe API calls run **outside** `withAppDatabaseContext`. The service interleaves: `withAppDatabaseContext(read)` → Stripe call → `withAppDatabaseContext(write)`.
- **Retained mutable state (not an immutable ledger)** (audit-#B2): subscription rows are updated in place as status transitions (Stripe syncs, cancel/resume, plan changes, seat counts) and are never soft- or hard-deleted — cancellation transitions to `canceled` and the row stays for forensic + invoice-history value. DB-level append-only enforcement (as on `audit.logs`) is intentionally NOT applied, because in-place status transitions are the table's purpose; immutability is scoped to the monotonic `last_stripe_event_created_at` watermark that blocks stale/out-of-order events, not to the row as a whole.

## Lifecycle

```mermaid
stateDiagram-v2
  [*] --> trialing: created with trial
  [*] --> active: created without trial
  trialing --> active: trial ends, payment succeeds
  active --> past_due: invoice.payment_failed
  past_due --> active: invoice.paid
  past_due --> canceled: Stripe gives up dunning
  active --> canceled: customer cancels
  canceled --> [*]
```

## Seats (REQ-4)

- The public subscription response carries `seats_total` (the plan's `included_seats`, or the Free ceiling while unpaid or past dunning grace; `null` = unlimited) and `seats_used` (count of ACTIVE + INVITED memberships, resolved cross-domain via the tenancy membership service).
- **Seat enforcement** lives in tenancy's `MembershipService.create`: it calls back into `SubscriptionService.reserveSeatCeilingForMemberAdd` (a `SELECT ... FOR UPDATE` on the active subscription row) and rejects the add with `409 seat_limit_reached` when `used >= ceiling`. No-op when the organization has no active subscription or the plan is unlimited.
- **Billed from the first invoice.** Create passes the organization's ACTIVE + INVITED count (at least 1) as the Stripe `quantity`; a member who joins between that read and the commit is reconciled by the seat sync enqueued after the create.
- **Stripe quantity sync** is out-of-band: every operation that moves the ACTIVE + INVITED count enqueues a `subscription-seat-sync` job (`queues/` + `workers/`); the worker pushes the member count to Stripe (`updateSubscriptionQuantity`) and persists `subscriptions.seats`. The `customer.subscription.updated` webhook also reconciles `seats` from the Stripe item quantity. A Stripe outage never fails member management.
- **One seat sync per organization at a time.** The enqueue deduplicates on `seat-sync-<organization>` with `keepLastIfActive` (`subscriptionSeatSyncDeduplication`): while the organization's job waits, further changes add nothing (it has not read the count yet); while it runs, the latest change is kept and runs once after it. Without it two replicas could sync one organization at once and the run that read the older count could finish last, leaving Stripe on the wrong quantity.
- **Hourly seat reconcile** (`subscription-seat-reconcile`, a repeatable job on the seat-sync queue run by the seat-sync worker — no worker or connection budget of its own): one read across tenants under the retention maintenance context (`findSeatReconcileCandidates`) finds (1) Stripe-backed subscriptions whose synced `seats` differs from the seats in use — a lost enqueue — and re-enqueues their seat sync, and (2) TEAM organizations without a paid entitlement holding more ACTIVE members than the Free allowance, and runs `enforceFreeSeatCeiling` for each.
- **Losing the entitlement suspends the excess.** When a Stripe event leaves the subscription cancelled, expired, paused or never paid, `enforceFreeSeatCeilingAfterCommitIfEntitlementLost` schedules `enforceFreeSeatCeiling` for after the event commits: it re-reads the entitlement, then suspends the most recently joined non-owner ACTIVE members down to the Free plan's `included_seats` (suspended, never removed). The dunning grace's end has no event — the hourly reconcile covers it. `joined_at` is stamped once, so a reactivated member keeps their place in that order.
- **Plan changes run one at a time per subscription** (`withRedisLock` on `billing:subscription:change-plan:<subscription>`; contention → `409 subscription_change_in_progress`) and never write `current_period_start` / `current_period_end` — the billing period is Stripe's, synced by the webhook.
- **Compensation only for a failed write.** Create cancels the just-created Stripe subscription only when the local insert fails; a failure after the commit never cancels a subscription the organization now has, and when the webhook's `.created` inserted the row first (`idx_subscriptions_provider_subscription_id_unique`) the create returns that row. The webhook inserts use `createUnlessProviderSubscriptionExists` (`ON CONFLICT DO NOTHING` on that index), so a lost race returns `null` without aborting the event's transaction.
  - The operations that move it: member add, member remove, leave-organization, change-plan, **suspend / reactivate** (SUSPENDED does not occupy a seat, so crossing that line in either direction counts), and **invitation revoke** (an INVITED membership holds a seat). The last two used to be silent, which left Stripe billing a suspended seat until some unrelated member change happened to reconcile it.
  - The one definition of "occupies a seat" is `SEAT_CONSUMING_MEMBERSHIP_STATUSES` in tenancy's `membership.types.ts`, used by both the `seats_used` count query and the status-transition check — keeping those apart is what let the suspend path drift.
- **Cross-domain DI**: membership↔subscription is a true cycle (billing reads `seats_used` from tenancy; tenancy enforces the limit via billing), broken by late-wiring `SubscriptionService` into `MembershipService.wireSeatEnforcement` in the composition root. `MemberInvitationService.wireSeatQuantitySync` takes the enqueue half of the same port, for revoke.

## Events

- Emits: none — subscription state transitions are persisted directly from Stripe webhook events; no in-process domain events are published.

## External integrations

- **Stripe** — wrapped by [src/infrastructure/payment/stripe.client.ts](src/infrastructure/payment/stripe.client.ts) with circuit breaker + Sentry instrumentation.

## Failure modes

- **Stripe API failure on a user-initiated mutation (`create` / `cancel` / `resume`)** → the provider adapter is **fail-closed**: it logs and throws `ServiceUnavailableError` (503, `errors:paymentProviderUnavailable`) *before* any local write, so subscription state in DB is unchanged (no row created, no `cancel_at_period_end` / `status` flip). The Stripe webhook reconciles once Stripe recovers.
- **Stripe `Idempotency-Key` reuse with different payload** → Stripe returns 400; we surface as 400 to the client.
- **Webhook event timestamp older than the row** → service rejects the change (logs at info), Stripe retry will eventually pass with the latest event.

## Policy constants

- `IDEMPOTENCY_RESPONSE_CACHE_TTL_SECONDS = 86 400`
