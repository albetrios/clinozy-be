/**
 * What Load Testing Monitoring may keep of a proxied call.
 *
 * The monitor records every request and response so a failed run can be read rather than guessed
 * at — and login traffic carries passwords, access tokens, refresh secrets and API keys in its
 * bodies and headers. Nothing reusable is kept: bodies go through the application's own redactor
 * (`redactSensitive`, the one the logger and Sentry use), so the monitor and the logs agree on what
 * a secret is.
 *
 * Imports a TypeScript module, so the monitor runs under tsx (`pnpm load:monitor`).
 */
import {
  SENSITIVE_KEY_FRAGMENTS,
  isSensitiveKey,
  redactSensitive,
  redactSensitiveQueryString,
} from '@/shared/utils/security/sensitive-redaction.util.js';

const REDACTED = '[redacted]';

/**
 * Headers safe to show: `Authorization` keeps a non-reusable fingerprint (enough to correlate
 * calls of one virtual user), cookies keep their names and a short prefix, and every other
 * sensitive header (`X-Api-Key`, `X-Captcha-Token`, `X-CSRF-Token`, `Stripe-Signature`, …) is
 * replaced outright.
 */
export function redactHeaders(headers) {
  const out = {};
  for (const [name, raw] of Object.entries(headers)) {
    const key = name.toLowerCase();
    const value = Array.isArray(raw) ? raw.join('; ') : String(raw ?? '');
    if (key === 'authorization') {
      const bearer = /^Bearer\s+(.*)$/i.exec(value);
      out[name] = bearer
        ? `Bearer ${bearer[1].slice(0, 12)}…${bearer[1].slice(-8)} (${bearer[1].length} chars)`
        : REDACTED;
    } else if (key === 'cookie' || key === 'set-cookie') {
      out[name] = value
        .split(/;\s*/)
        .map((cookie) => {
          const index = cookie.indexOf('=');
          if (index < 0) return cookie;
          const cookieValue = cookie.slice(index + 1);
          return cookieValue.length > 16
            ? `${cookie.slice(0, index)}=${cookieValue.slice(0, 8)}…(${cookieValue.length})`
            : cookie;
        })
        .join('; ');
    } else if (isSensitiveKey(key)) {
      out[name] = REDACTED;
    } else {
      out[name] = value;
    }
  }
  return out;
}

/** A query string with sensitive parameter values replaced (`?token=…`). */
export function redactQuery(search) {
  return search ? redactSensitiveQueryString(search) : '';
}

/**
 * The body text safe to keep.
 *
 * JSON is parsed and every sensitive key redacted at any depth; form-encoded bodies have their
 * sensitive fields redacted. A body that cannot be parsed — truncated JSON, or text naming a
 * sensitive field — is withheld rather than shown raw: failing closed costs a missing body,
 * failing open leaks a credential.
 *
 * @param {Buffer | undefined} buffer
 * @param {string | string[] | undefined} contentType
 * @returns {string}
 */
export function redactBody(buffer, contentType) {
  if (!buffer?.length) return '';
  const text = buffer.toString('utf8');
  const type = String(contentType ?? '').toLowerCase();
  try {
    return JSON.stringify(redactSensitive(JSON.parse(text)));
  } catch {
    // not (complete) JSON — handled below
  }
  if (type.includes('application/x-www-form-urlencoded')) return redactSensitiveQueryString(text);
  const lowered = text.toLowerCase();
  if (
    type.includes('json') ||
    SENSITIVE_KEY_FRAGMENTS.some((fragment) => lowered.includes(fragment))
  ) {
    return `[body withheld: ${buffer.length} bytes that could not be parsed for redaction]`;
  }
  return text;
}
