import { env } from '@/shared/config/env.config.js';
import { MILLISECONDS_PER_SECOND } from '@/shared/constants/ttl.constants.js';

/**
 * Why `POST /auth/refresh` refuses a session it found: it has been idle too long, or it reached
 * its absolute lifetime. The value is the response's `error.reason` — clinozy-fe reads it to
 * say why the user was signed out, so the two strings are a public contract.
 */
export const SESSION_LAPSE_REASON = {
  IDLE_TIMEOUT: 'idle_timeout',
  SESSION_EXPIRED: 'session_expired',
} as const;

/** One of {@link SESSION_LAPSE_REASON}'s values. */
export type SessionLapseReason = (typeof SESSION_LAPSE_REASON)[keyof typeof SESSION_LAPSE_REASON];

/**
 * When a session created now expires: {@link env.AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS} from now.
 *
 * @remarks
 * - **Algorithm:** `now + AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS`, stored as the row's `expires_at`
 *   by every sign-in path (password, email code, OAuth, passkey, MFA).
 * - **Failure modes:** none.
 * - **Side effects:** none.
 * - **Notes:** E-2 — the absolute cap lives on the server; the client's own 12-hour stamp is a
 *   courtesy, not the control.
 */
export function sessionExpiresAtFromNow(now: Date = new Date()): Date {
  return new Date(
    now.getTime() + env.AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND,
  );
}

/**
 * Whether a session has lapsed, and why — the absolute cap first, then the idle timeout.
 *
 * @remarks
 * - **Algorithm:** `session_expired` when the session was created at least
 *   {@link env.AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS} ago or its `expires_at` has passed (a row
 *   issued before the cap was shortened keeps its later `expires_at`, so creation time is checked
 *   too); `idle_timeout` when `last_active_at` — bumped by every successful refresh — is at least
 *   {@link env.AUTH_SESSION_IDLE_TIMEOUT_SECONDS} old; otherwise `null`.
 * - **Failure modes:** none — pure.
 * - **Side effects:** none.
 * - **Notes:** E-2 — before this, refresh checked only the 7-day `expires_at`, so a closed laptop's
 *   cookie stayed good for a week and the 30-minute idle sign-out existed only in the browser.
 */
export function findSessionLapse(options: {
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  now?: Date;
}): SessionLapseReason | null {
  const nowMillis = (options.now ?? new Date()).getTime();
  const absoluteDeadline =
    options.createdAt.getTime() +
    env.AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND;
  if (nowMillis >= absoluteDeadline || nowMillis >= options.expiresAt.getTime()) {
    return SESSION_LAPSE_REASON.SESSION_EXPIRED;
  }
  const idleDeadline =
    options.lastActiveAt.getTime() +
    env.AUTH_SESSION_IDLE_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND;
  if (nowMillis >= idleDeadline) {
    return SESSION_LAPSE_REASON.IDLE_TIMEOUT;
  }
  return null;
}
