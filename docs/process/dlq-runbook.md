# Dead-letter queue (DLQ) runbook

When a BullMQ job fails for good — it used its last attempt, or it threw `UnrecoverableError` (a job that can never succeed: a missing row, an unreadable secret, a corrupt payload) — the worker records it in **`audit.dead_letter_jobs`** (the durable ledger) and copies a snapshot to **`<source-queue>-dlq`** (see [`dead-letter.ts`](../../src/infrastructure/queue/dlq/dead-letter.ts)). It also raises one Sentry event — except for an expected failure (a customer webhook endpoint that never accepted the delivery: warn log, no page; the webhook's owner sees it on the attempt row). This runbook covers inspection and safe replay.

**Automated replay:** the `dlq-auto-retry` sweeper (`DLQ_AUTO_RETRY_*`) replays each ledger row of a replayable queue **once**, after `DLQ_AUTO_RETRY_COOLDOWN_MINUTES` and only while that queue's outbound circuit is closed. The replay carries how deep it is in its lineage (`dlqReplayAttempt`); if it fails for good again, the new ledger row records that depth (`replay_depth`) and waits its own cooldown. A lineage stops at `DLQ_AUTO_RETRY_MAX_COUNT` replays — those rows are left to an operator. Every handled row gets `auto_retry_resolved_at`.

**Retention:** a `<source>-dlq` mirror keeps each snapshot for **30 days** — the DLQ-depth tick (every 15 minutes) removes older ones (`queue.dead_letter.trimmed`) — and holds at most **1,000** snapshots: past that a final failure is still recorded in `audit.dead_letter_jobs` and alerted, only not mirrored (`queue.dead_letter.mirror_full`). Inspect and replay within the window; the ledger row stays the record (`audit-retention` prunes the ledger on its own schedule). BullMQ's `removeOnComplete` / `removeOnFail` never applied here: nothing consumes a mirror, so its snapshots never complete or fail.

**Provider outage (not a dead letter):** while Resend, Stripe or S3 is down, the queues that depend on it (`mail`; `stripe-webhook`, `subscription-seat-sync`; `user-data-export`) pause and retry every five minutes — their jobs wait, they are not dead-lettered. Signs: `queue.provider_outage.paused` logs, `bullmq_provider_outage_parked_jobs_total` rising, the queue's `delayed` + `waiting` counts growing, the circuit OPEN in `/readyz`. Once the provider is back the next probe succeeds and the backlog drains by itself, at most five minutes later; nothing to replay.

## When to use

- `queue.dlq.depth.high` log or Sentry warning from the DLQ depth worker
- Bull Board shows growing `*-dlq` queues
- Known transient outage (Stripe, Resend, subscriber URL) is resolved and jobs should be retried

## Prerequisites

- `.env` with `DATABASE_URL` and `REDIS_URL` (same as worker)
- Root cause fixed — replaying poison jobs will fail again and refill the DLQ

## CLI: `pnpm tool:dlq-replay`

| Command | Purpose |
| ------- | ------- |
| `pnpm tool:dlq-replay -- --list` | List jobs in all **replayable** DLQs (`webhook-delivery`, `notification`) |
| `pnpm tool:dlq-replay -- --list notification-dlq` | List jobs in one DLQ |
| `pnpm tool:dlq-replay -- --replay notification-dlq --job-id <id> --actor-user-public-id <usr> [--dry-run]` | Re-enqueue one job through its source queue (its attempts and retention apply; writes a `queue.dlq.replayed` audit row) and remove it from the DLQ |
| `pnpm tool:dlq-replay -- --replay-all webhook-delivery-dlq --actor-user-public-id <usr> --limit 10 [--dry-run]` | Replay up to N jobs |

Always run `--dry-run` first in production.

The full list of source queues (work + retention/cleanup + observability) is in [bull-board.md](../reference/runtime/bull-board.md#queues-shown). Tombstone-retention DLQs (`*-tombstone-retention-dlq`) are operationally rare; if they fill, escalate to engineering — there is no application-level replay path because retention deletions are idempotent and the next cron tick will retry the same row range.

## Per-queue replay guidance

| DLQ | Reconstructed job payload | If replay fails |
| --- | ------------------------- | --------------- |
| `mail-dlq` | Not replayable — a record, not a work list (inspect it in Bull Board or the ledger). | A `failed` row's body is scrubbed and cannot be re-sent — the user requests a new email; a row released to `pending` (circuit open on the last attempt) is re-enqueued by the outbox sweeper on its own |
| `webhook-delivery-dlq` | `{ deliveryAttemptPublicId, organizationPublicId }` | Fix URL/secret, then replay — the attempt re-claims its `FAILED` row (a `SENT` one is skipped) |
| `stripe-webhook-dlq` | Not replayable — the `billing.stripe_webhook_events` ledger reclaim is the retry path (a record here). | A `failed` row is reclaimed on its own; an `abandoned` one (attempt cap or permanent failure) waits for `pnpm tool:stripe-webhook-replay -- --retry <event id>` once the cause is fixed |
| `notification-dlq` | `{ notificationPublicId, organizationPublicId, userPublicId }` (`organizationPublicId` is `null` for a notification without one; the recipient's public id scopes that read) — worker reloads content from `notify.notifications` | Fix the cause, then replay |

## Operational checklist

1. Confirm DLQ depth alert or manual triage in Bull Board (`ENABLE_QUEUE_DASHBOARD=true`).
2. Identify `failed_reason` and `original_queue` on the DLQ job.
3. Fix code, config, or downstream service.
4. `pnpm tool:dlq-replay -- --list <queue-dlq>` — note job ids.
5. `pnpm tool:dlq-replay -- --replay <queue-dlq> --job-id <id> --actor-user-public-id <usr> --dry-run` then without `--dry-run`.
6. Watch source queue depth and worker logs; confirm DLQ count drops.
7. For Stripe billing events, cross-check `billing.stripe_webhook_events` processing status.

## Related

- [bull-board.md](../reference/runtime/bull-board.md) — dashboard triage
- [workers-and-events.md](../reference/runtime/workers-and-events.md) — DLQ wiring and shutdown order
- [worker-scaling.md](../deployment/runbooks/worker-scaling.md) — worker deploy and health
