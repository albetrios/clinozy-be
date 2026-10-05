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
- **Stuck-row reclaim**: the sweeper reclaims rows stuck in `sending` for longer than `MAIL_OUTBOX_RECLAIM_SENDING_MINUTES` (default 30 — comfortably above worst-case delivery time) so a crashed worker doesn't strand outbox rows forever. This cutoff is deliberately larger than `MAIL_OUTBOX_SWEEP_PENDING_MINUTES` (default 15), which only governs the re-enqueue scan of `pending` rows.
- **Idempotent re-send**: each send passes the row's `Idempotency-Key` (`mail-outbox-<resend_idempotency_token>`) to Resend, so a worker that sent then crashed before marking `sent` is de-duplicated on reclaim instead of delivering twice (the outbox is at-least-once at the queue layer, exactly-once at the provider). The token is a random uuid Postgres generates on insert, stored on the row so every retry and reclaim reuses it. It is not the bigserial `id`: that restarts at 1 after `TRUNCATE ... RESTART IDENTITY` or on a fresh database, and every database sending through the same Resend account counts from 1 — Resend keeps a key for 24 hours and rejects one reused with a different body (409 `invalid_idempotent_request`), so the email is never delivered.
- **Resend over alternatives**: chosen for deliverability, simple API, signed webhook callbacks, and a free dev tier. Wrapped by [mail.service.ts](src/infrastructure/mail/mail.service.ts) with a circuit breaker (`opossum`) + Sentry.
- **HTML-first templates** with optional plaintext fallback. Templates live in [templates/](src/infrastructure/mail/templates/); the renderer interpolates locale-aware strings via i18next.
- **No body proxying through the API**: the outbound payload is constructed in the worker process; the API never speaks to Resend directly.

## Operational concerns

- **Per-attempt timeout**: enforced by the Resend client; final failures emit Sentry events.
- **Reclaim cadence**: scheduled via [src/infrastructure/queue/scheduler.ts](src/infrastructure/queue/scheduler.ts).
- **Dev mode**: when `RESEND_API_KEY` is unset, the worker logs the rendered email instead of sending — useful for local dev and tests.
- **DLQ**: `mail-dlq` and `mail-outbox-sweeper-dlq` capture final failures. `mail-dlq` is a record, not a replay list: a failed row's body is scrubbed (the user requests a new email), and a row left `pending` is re-enqueued by the sweeper.

## External dependencies

- **Resend** — production transactional email provider (`RESEND_API_KEY`).

## Tuning parameters

- `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_REPLY_TO_ADDRESS`.
- `MAIL_OUTBOX_RECLAIM_SENDING_MINUTES = 30` (reclaim cutoff for stuck `sending` rows).
- `MAIL_OUTBOX_SWEEP_PENDING_MINUTES = 15` (re-enqueue scan cutoff for `pending` rows).
- `BULLMQ_DEFAULT_LOCK_DURATION_MS = 30 000`.

## Failure modes

- **Resend API timeout** → BullMQ retries with backoff; final failure → DLQ + Sentry. Mail outbox row stays for forensic value.
- **Worker crash mid-send** → row stuck in `sending`; sweeper reclaims after `MAIL_OUTBOX_RECLAIM_SENDING_MINUTES` and re-queues. The row's stored Resend idempotency key prevents a duplicate delivery if the crash happened after Resend accepted the message.
- **Resend refuses the email itself** (422 `validation_error` — e.g. a bad recipient — `missing_required_field`, `invalid_attachment`, `invalid_parameter`) → a per-email rejection: the row is marked `failed` on the first attempt, the job completes as `rejected` (no retries, no DLQ, no page), and the `resend` circuit counts the call as a success — one bad address cannot hold back every other email.
- **Resend 409 `invalid_idempotent_request`** → also a per-email rejection: the key was already used in the last 24 hours with a different body. Keys come from the per-row random token, so this points to a key built from something other than `resend_idempotency_token`.
- **Disposable email rejected at the source domain (auth)** → never reaches the outbox.
- **Resend signs the outbound payload but the customer's email server bounces** → Resend captures the bounce; we don't inspect bounces today (future work to feed back into `user-notification-preferences`).
