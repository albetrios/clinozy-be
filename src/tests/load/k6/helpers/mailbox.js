import http from 'k6/http';
import { requireData, assertCondition } from './checks.js';

/** Requires an explicitly authorized loopback fixture; mail links are never read from production. */
export function requireMailbox() {
  if (
    !(
      /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(__ENV.LOAD_MAILBOX_URL || '') &&
      __ENV.LOAD_MAILBOX_TOKEN
    )
  )
    throw new Error('Authorized loopback LOAD_MAILBOX_URL and LOAD_MAILBOX_TOKEN required');
}

/** Reads the real committed email token for a newly generated test recipient, without logging it. */
export function mailToken({ email, invitationId }) {
  const query = `email=${encodeURIComponent(email)}&kind=${invitationId ? 'invitation' : 'password-reset'}${invitationId ? `&invitation_id=${encodeURIComponent(invitationId)}` : ''}`;
  const data = requireData(
    http.get(`${__ENV.LOAD_MAILBOX_URL}/?${query}`, {
      headers: { Authorization: `Bearer ${__ENV.LOAD_MAILBOX_TOKEN}` },
      tags: { name: 'fixture-mailbox', fixture: 'mailbox' },
    }),
    'committed email token',
  );
  assertCondition(typeof data.token === 'string' && data.token.length > 10, 'mail token present');
  return data.token;
}
