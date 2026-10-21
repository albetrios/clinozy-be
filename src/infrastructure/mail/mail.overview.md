`src/infrastructure/mail/`

# Mail infrastructure

## Purpose

Outbound email pipeline: the mail outbox table (transactional outbox pattern), the BullMQ queue, the delivery processor wrapping Resend, and the sweeper that reclaims rows stuck in `sending`. HTML templates for transactional mail (email verification-code, password reset, organization invitation) live here too.

This module is **infrastructure**, not a domain — it offers `recordOutboxEmail()` / `dispatchOutboxEmail()` primitives that any domain may call. Domains owning content (auth, tenancy, user) provide template inputs; this module owns delivery semantics.

## Design decisions

- **Transactional outbox pattern**: the originating service inserts into `mail_outbox` inside the same transaction that wrote the business row. The outbox sweeper / mail processor decouples delivery from the request lifecycle. See `transactional-outbox` in [src/PATTERNS.md](src/PATTERNS.md).
- **The token is the row's handle**: the job, the outbox sweeper and the post-commit dispatch name a row by its `resend_idempotency_token` (a uuid, unique-indexed), never the bigserial — that restarts after a restore while queued jobs live on, and a job would load another row.
- **Atomic claim**: the worker uses `UPDATE mail_outbox SET status='sending' WHERE resend_idempotency_token = $1 AND status='pending'` so two workers cannot claim the same row.
- **Jobs with nothing to do complete**: a row that is gone (`not_found`), already `sent`, or held by another execution (`in_flight` — the sweeper re-enqueues it if that one died) completes the job as `skipped`. Resend refusing the email itself (a bad recipient, field or attachment) fails the row and completes as `rejected` — no retry, no page. Recipients that do not parse fail the row and throw `UnrecoverableError` (a broken row; it used to stay `sending` and loop through the sweeper).
- **Stuck-row reclaim**: the sweeper reclaims rows stuck in `sending` for longer than `MAIL_OUTBOX_RECLAIM_SENDING_MINUTES` (default 30 — comfortably above worst-case delivery time) so a crashed worker doesn't strand outbox rows forever. This cutoff is deliberately larger than `MAIL_OUTBOX_SWEEP_PENDING_MINUTES` (default 3), which only governs the re-enqueue scan of `pending` rows: the sweeper runs every two minutes, so an email whose post-commit enqueue was lost goes out within about five — inside a sign-in code's 15-minute life. Re-enqueueing a row whose job is still live is a no-op (the enqueue deduplicates on the row's token).
- **Idempotent re-send**: each send passes the row's `Idempotency-Key` (`mail-outbox-<resend_idempotency_token>`) to Resend, so a worker that sent then crashed before marking `sent` is de-duplicated on reclaim instead of delivering twice (the outbox is at-least-once at the queue layer, exactly-once at the provider). The token is a random uuid Postgres generates on insert, stored on the row so every retry and reclaim reuses it. It is not the bigserial `id`: that restarts at 1 after `TRUNCATE ... RESTART IDENTITY` or on a fresh database, and every database sending through the same Resend account counts from 1 — Resend keeps a key for 24 hours and rejects one reused with a different body (409 `invalid_idempotent_request`), so the email is never delivered.
- **Resend over alternatives**: chosen for deliverability, simple API, signed webhook callbacks, and a free dev tier. Wrapped by [mail.service.ts](src/infrastructure/mail/mail.service.ts), which calls Resend through `outboundCall` behind the shared Redis-backed `resend` circuit.
- **HTML-first templates** with optional plaintext fallback. Templates live in [templates/](src/infrastructure/mail/templates/); the renderer interpolates locale-aware strings via i18next.
- **No body proxying through the API**: the outbound payload is constructed in the worker process; the API never speaks to Resend directly.

## Operational concerns

- **Per-attempt timeout**: enforced by the Resend client; final failures emit Sentry events.
- **Reclaim cadence**: scheduled via [src/infrastructure/queue/scheduler.ts](src/infrastructure/queue/scheduler.ts).
- **No Resend key**: when `RESEND_API_KEY` is unset the mail worker is not registered, and a request that must send a sign-in code answers 503 `errors:mailNotConfigured`.
- **DLQ**: `mail-dlq` and `mail-outbox-sweeper-dlq` capture final failures. `mail-dlq` is a record, not a replay list: a failed row's body is scrubbed (the user requests a new email), and a row left `pending` is re-enqueued by the sweeper.

## External dependencies

- **Resend** — production transactional email provider (`RESEND_API_KEY`).

## Tuning parameters

- `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` (required once `RESEND_API_KEY` is set), `EMAIL_FROM_NAME`.
- `MAIL_RESERVED_DOMAIN_SKIP_ENABLED = false` (`local` / `development` only: drop reserved-domain recipients before Resend).
- `MAIL_OUTBOX_RECLAIM_SENDING_MINUTES = 30` (reclaim cutoff for stuck `sending` rows).
- `MAIL_OUTBOX_SWEEP_PENDING_MINUTES = 3` (re-enqueue scan cutoff for `pending` rows); the sweeper runs every two minutes (`MAIL_OUTBOX_SWEEPER_CRON`).
- `RESEND_MAX_REQUESTS_PER_SECOND = 10` (the mail queue's limiter — Resend's per-team rate limit).
- `BULLMQ_DEFAULT_LOCK_DURATION_MS = 30 000`.

## Failure modes

- **Burst over Resend's rate limit** → prevented: the worker's limiter paces sends to `RESEND_MAX_REQUESTS_PER_SECOND` across every replica. A 429 `rate_limit_exceeded` that still arrives is a throttle — no circuit failure, no attempt spent, the queue pauses for Resend's `Retry-After`.
- **Broadcast in progress when someone signs in** → the sign-in code goes first: notification email is enqueued in the `bulk` lane (a BullMQ priority), transactional mail in none, and BullMQ takes the latter first.
- **Resend down** (the `resend` circuit opens, or a send failure leaves it open or half-open) → the `mail` queue pauses on every replica for five minutes and the job is parked without spending an attempt; the claim is released, so the row stays `pending` — never failed — however long the outage lasts. The next job after each pause is the probe; once Resend answers, the backlog drains. See [Provider outage pause](docs/reference/runtime/workers-and-events.md#provider-outage-pause).
- **Resend API timeout while the circuit stays closed** → BullMQ retries with backoff; final failure → DLQ + Sentry. Mail outbox row stays for forensic value.
- **Sweeper passes during a long outage** → each pass re-enqueues the `pending` rows, but `enqueueMailOutboxJob` deduplicates on the row's token: a row has one live job, so the passes add nothing.
- **Worker crash mid-send** → row stuck in `sending`; sweeper reclaims after `MAIL_OUTBOX_RECLAIM_SENDING_MINUTES` and re-queues. The row's stored Resend idempotency key prevents a duplicate delivery if the crash happened after Resend accepted the message.
- **Resend refuses the email itself** (422 `validation_error` — e.g. a bad recipient — `missing_required_field`, `invalid_attachment`, `invalid_parameter`) → a per-email rejection: the row is marked `failed` on the first attempt, the job completes as `rejected` (no retries, no DLQ, no page), and the `resend` circuit counts the call as a success — one bad address cannot hold back every other email.
- **Recipient on a reserved domain** (`example.com`, `*.test`, `*.invalid`, … — every seeded and test account) → Resend refuses it as a per-email rejection above. On `local` and `development`, `MAIL_RESERVED_DOMAIN_SKIP_ENABLED` drops such recipients before the send instead; a row left with none is marked `failed` without calling Resend and the job completes as `skipped` (`reserved_domain`). The env schema refuses the flag on any other target, so production hands every recipient to Resend.
- **Resend 409 `invalid_idempotent_request`** → also a per-email rejection: the key was already used in the last 24 hours with a different body. Keys come from the per-row random token, so this points to a key built from something other than `resend_idempotency_token`.
- **Disposable email rejected at the source domain (auth)** → never reaches the outbox.
- **Resend signs the outbound payload but the customer's email server bounces** → Resend captures the bounce; we don't inspect bounces today (future work to feed back into `user-notification-preferences`).
