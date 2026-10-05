-- Drop the upper bound on notify.webhook_delivery_attempts.attempt_count.
--
-- `attempt_count <= 5` matched the old delivery schedule, where a claim stored the BullMQ attempt
-- number (at most 5). The count is now every send ever started for the attempt — eight per job on
-- the day-long retry schedule, and more again after a dead-letter replay — so only the lower bound
-- still describes valid data.

ALTER TABLE notify.webhook_delivery_attempts DROP CONSTRAINT IF EXISTS chk_webhook_attempts_count;
--> statement-breakpoint

ALTER TABLE notify.webhook_delivery_attempts
  ADD CONSTRAINT chk_webhook_attempts_count CHECK (attempt_count >= 0) NOT VALID;
--> statement-breakpoint

ALTER TABLE notify.webhook_delivery_attempts VALIDATE CONSTRAINT chk_webhook_attempts_count;
