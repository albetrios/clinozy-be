import { describe, expect, it } from 'vitest';
import { env } from '@/shared/config/env.config.js';
import {
  findSessionLapse,
  SESSION_LAPSE_REASON,
  sessionExpiresAtFromNow,
} from '@/domains/auth/sub-domains/auth-session/session-lifetime.js';

const SECOND_MILLIS = 1000;
const NOW = new Date('2026-10-31T12:00:00.000Z');

function secondsBefore(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * SECOND_MILLIS);
}

/** E-2 — the server's idle and absolute session limits. */
describe('session-lifetime', () => {
  const idle = env.AUTH_SESSION_IDLE_TIMEOUT_SECONDS;
  const absolute = env.AUTH_SESSION_ABSOLUTE_TIMEOUT_SECONDS;
  const farExpiry = new Date(NOW.getTime() + 7 * 24 * 3600 * SECOND_MILLIS);

  it('keeps a session refreshed just inside the idle timeout', () => {
    expect(
      findSessionLapse({
        createdAt: secondsBefore(idle),
        lastActiveAt: secondsBefore(idle - 1),
        expiresAt: farExpiry,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('reports idle_timeout once last_active_at is the idle timeout old', () => {
    expect(
      findSessionLapse({
        createdAt: secondsBefore(idle + 60),
        lastActiveAt: secondsBefore(idle),
        expiresAt: farExpiry,
        now: NOW,
      }),
    ).toBe(SESSION_LAPSE_REASON.IDLE_TIMEOUT);
  });

  it('reports session_expired at the absolute cap even when the session was just active', () => {
    expect(
      findSessionLapse({
        createdAt: secondsBefore(absolute),
        lastActiveAt: secondsBefore(1),
        expiresAt: farExpiry,
        now: NOW,
      }),
    ).toBe(SESSION_LAPSE_REASON.SESSION_EXPIRED);
  });

  it('reports session_expired before idle_timeout when both apply', () => {
    expect(
      findSessionLapse({
        createdAt: secondsBefore(absolute + idle),
        lastActiveAt: secondsBefore(idle),
        expiresAt: farExpiry,
        now: NOW,
      }),
    ).toBe(SESSION_LAPSE_REASON.SESSION_EXPIRED);
  });

  it('honours a row expires_at that is earlier than the cap', () => {
    expect(
      findSessionLapse({
        createdAt: secondsBefore(60),
        lastActiveAt: secondsBefore(1),
        expiresAt: NOW,
        now: NOW,
      }),
    ).toBe(SESSION_LAPSE_REASON.SESSION_EXPIRED);
  });

  it('keeps the two reason strings clinozy-fe reads', () => {
    expect(SESSION_LAPSE_REASON).toEqual({
      IDLE_TIMEOUT: 'idle_timeout',
      SESSION_EXPIRED: 'session_expired',
    });
  });

  it('sets a new session to expire at the absolute cap', () => {
    expect(sessionExpiresAtFromNow(NOW).getTime()).toBe(NOW.getTime() + absolute * SECOND_MILLIS);
  });
});
