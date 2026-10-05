-- Drop notify.resolve_user_public_id_for_notification(BIGINT).
--
-- The notification worker called this SECURITY DEFINER function to turn a notification's bigserial
-- into its recipient's public id before reading a notification without an organization under the
-- recipient's scope. The notification job now carries the recipient's public id (and the
-- notification's), never a bigserial, so nothing calls it — and a function that reads past RLS is
-- surface worth removing, not keeping.

DROP FUNCTION IF EXISTS notify.resolve_user_public_id_for_notification (BIGINT);
