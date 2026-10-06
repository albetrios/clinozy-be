-- Track each dead-letter's replay lineage on the ledger row itself.
--
-- The auto-retry sweeper counted its replays of a ledger row in Redis, under a key built from the
-- row's bigserial with a 30-day TTL: the count left Postgres, keyed by an id a restore restarts, and
-- a row could replay again once the counter expired. Now every replayed job carries how deep in a
-- replay lineage it is (`dlqReplayAttempt`), and a replay that fails for good writes a new ledger
-- row with that depth. The sweeper replays each row at most once and stops a lineage at
-- DLQ_AUTO_RETRY_MAX_COUNT — no counter anywhere else.
--
-- NOT NULL DEFAULT 0 is a metadata-only change (no table rewrite); every existing row is the first
-- failure of its lineage. The CHECK goes in NOT VALID, then validates without blocking writers.

ALTER TABLE audit.dead_letter_jobs
  ADD COLUMN IF NOT EXISTS replay_depth INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint

ALTER TABLE audit.dead_letter_jobs DROP CONSTRAINT IF EXISTS chk_dead_letter_jobs_replay_depth;
--> statement-breakpoint

ALTER TABLE audit.dead_letter_jobs
  ADD CONSTRAINT chk_dead_letter_jobs_replay_depth CHECK (replay_depth >= 0) NOT VALID;
--> statement-breakpoint

ALTER TABLE audit.dead_letter_jobs VALIDATE CONSTRAINT chk_dead_letter_jobs_replay_depth;
