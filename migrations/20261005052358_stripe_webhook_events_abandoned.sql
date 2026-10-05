-- Let a Stripe webhook ledger row end as `abandoned`.
--
-- A `failed` row was reclaimed by the sweeper every five minutes, forever: an event that can
-- never be processed (conflicting organization metadata, an event Stripe no longer has, a handler
-- that fails every time) retried without end, and every retry cycle that exhausted its BullMQ
-- attempts raised another dead-letter alert. Now the row is given up on — `abandoned`, with one
-- alert — after STRIPE_WEBHOOK_MAX_PROCESSING_ATTEMPTS processing attempts, or at once for a
-- failure no retry can fix. The reclaim scan never selects an abandoned row; an operator retries
-- one with `pnpm tool:stripe-webhook-replay -- --retry <event id>`.
--
-- Widening the CHECK: drop, re-add NOT VALID, then validate without blocking writers.

ALTER TABLE billing.stripe_webhook_events
  DROP CONSTRAINT IF EXISTS stripe_webhook_events_processing_status_check;
--> statement-breakpoint

ALTER TABLE billing.stripe_webhook_events
  ADD CONSTRAINT stripe_webhook_events_processing_status_check
  CHECK (processing_status IN ('processing', 'processed', 'skipped_duplicate', 'failed', 'abandoned'))
  NOT VALID;
--> statement-breakpoint

ALTER TABLE billing.stripe_webhook_events
  VALIDATE CONSTRAINT stripe_webhook_events_processing_status_check;
