# Stripe subscription changePlan / cancel reconciliation

How **API-initiated** subscription changes relate to **Stripe webhooks** and local database state. For webhook ingress and idempotency, see `src/domains/billing/sub-domains/stripe-webhook/`.

---

## changePlan (plan / price change)

| Step | System | Behavior |
| ---- | ------ | -------- |
| 1 | API `changePlan` | Updates Stripe subscription price when `STRIPE_SECRET_KEY` is set and the plan has a Stripe price id |
| 2 | API | Updates local `billing.subscriptions` (`plan_id`, period fields) |
| 3 | Stripe | Emits `customer.subscription.updated` (at-least-once) |
| 4 | Webhook worker | `StripeWebhookService` syncs status/period from the event via `syncFromStripeProviderSubscription` |

**Reconciliation window:** Treat Stripe as source of truth for provider-linked subscriptions within **minutes** of the API call. Until `customer.subscription.updated` is processed, local plan/period may lead Stripe briefly if step 2 succeeded and step 3 is delayed. The webhook path uses `stripe_created_at` ordering to ignore stale events.

**Compensation:** If local DB update fails after Stripe was updated, `changePlan` attempts to revert the Stripe price to the previous plan price (see `subscription.service.ts`).

**Stripe failures:** `changePlan` fails closed — nothing local is written when Stripe cannot follow. A Stripe-backed subscription moving to a plan with no Stripe price for its cycle is refused before any call (`422 planNotAvailableForBillingCycle`), and a Stripe outage on the price update throws (`503`) before the local write. Only a local-only subscription (no `provider_subscription_id`) changes plan without Stripe. Price the sandbox plans with `pnpm db:seed:stripe-catalog`.

---

## cancel (cancel at period end)

| Step | System | Behavior |
| ---- | ------ | -------- |
| 1 | API `cancel` | Calls Stripe `cancel_at_period_end` when a provider subscription id exists |
| 2 | API | Sets local `cancel_at_period_end: true` |
| 3 | Stripe | Eventually sends `customer.subscription.updated` / `customer.subscription.deleted` |
| 4 | Webhook worker | Syncs canceled status and period end |

**Reconciliation window:** Local `cancel_at_period_end` is immediate; final **status** (`CANCELED`) and period boundaries may arrive via webhook **seconds to minutes** later. Do not assume the subscription is fully canceled in Stripe until the webhook ledger row is `processed` or Stripe dashboard confirms.

**Stripe failures:** Stripe cancel errors are logged; local `cancel_at_period_end` is still set so the product UX is not blocked solely by provider errors.

---

## Operational checks

1. **Webhook lag:** Inspect `billing.stripe_webhook_events` (`processing_status`, `request_id` from correlation id) for stuck `processing` rows.
2. **Drift:** Compare local subscription `status` / `provider_subscription_id` with Stripe dashboard when users report billing mismatches after changePlan/cancel.
3. **Duplicate events:** Re-delivered webhooks are idempotent (`recordAtIngress` at the endpoint, `tryClaimEvent` in the worker, both `onConflictDoNothing`).

---

## Related

- [data-lifecycle-deletion.md](../../reference/data/data-lifecycle-deletion.md) — subscriptions are an immutable ledger (no `deleted_at`)
- [observability.md](observability.md) — Sentry + logs for `stripe.subscription.*` failures
- [cicd-and-deployment.md](../ci-cd/cicd-and-deployment.md) — `STRIPE_*` deploy secrets
- [`src/domains/billing/sub-domains/subscription/subscription.overview.md`](../../../src/domains/billing/sub-domains/subscription/subscription.overview.md) — subscription state machine, network-I/O-outside-RLS rule, stale-event rejection
- [`src/domains/billing/sub-domains/stripe-webhook/stripe-webhook.overview.md`](../../../src/domains/billing/sub-domains/stripe-webhook/stripe-webhook.overview.md) — webhook receiver, reclaim window, per-source DLQ
- [`src/FLOWS.md`](../../../src/FLOWS.md) § Stripe webhook ingest, § Subscription change — end-to-end flow diagrams
