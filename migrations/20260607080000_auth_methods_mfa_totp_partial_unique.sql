-- migration-transaction: none reason="CREATE INDEX CONCURRENTLY avoids a write-blocking SHARE lock on auth.auth_methods"

-- sec-re-04: enforces "at most one active MFA_TOTP per user" so re-enrollment
-- cannot leave a stale row that login picks via the (previously unordered)
-- `findTotpByUserId(.limit(1))` and uses to reject the user's working codes.
-- The application code now revokes the existing factor before inserting a new
-- one; this index makes the invariant a database guarantee.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_auth_methods_user_active_totp
ON auth.auth_methods (user_id)
WHERE method_type = 'MFA_TOTP' AND revoked_at IS NULL;
