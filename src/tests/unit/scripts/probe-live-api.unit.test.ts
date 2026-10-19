import { describe, expect, it } from 'vitest';
import {
  checkCorsPreflight,
  checkErrorEnvelope,
  checkSecurityHeaders,
  checkTls,
} from '@/scripts/ops/probe-live-api.js';

/** What the API's helmet and CORS middleware send (src/shared/middlewares/security/). */
const HARDENED = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'self';frame-ancestors 'none';object-src 'none'",
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cross-origin-resource-policy': 'same-origin',
};

/**
 * Locks in what the live probe calls a finding after a deploy: weak or missing security headers,
 * CORS that trusts an unknown origin or refuses the frontend, and a weak or expiring TLS setup.
 */
describe('live API probe', () => {
  it('accepts the hardened headers and names each one that is missing or weak', () => {
    expect(checkSecurityHeaders(HARDENED)).toEqual([]);
    expect(
      checkSecurityHeaders({
        ...HARDENED,
        'strict-transport-security': 'max-age=86400',
        'content-security-policy': "default-src 'self'",
        'x-powered-by': 'Express',
      }),
    ).toEqual([
      'HSTS max-age 86400 is under 180 days',
      "Content-Security-Policy has no frame-ancestors 'none'",
      'X-Powered-By is sent (Express)',
    ]);
    expect(checkSecurityHeaders({})).toHaveLength(5);
  });

  it('flags CORS that grants an untrusted origin, and an allowed origin it refuses', () => {
    const origin = 'https://cors-probe.invalid';
    expect(checkCorsPreflight({ origin, headers: {}, isAllowed: false })).toEqual([]);
    expect(
      checkCorsPreflight({
        origin,
        headers: { 'access-control-allow-origin': origin },
        isAllowed: false,
      }),
    ).toEqual([`CORS grants an origin it must not trust (${origin})`]);
    expect(
      checkCorsPreflight({
        origin,
        headers: { 'access-control-allow-origin': '*' },
        isAllowed: false,
      }),
    ).toEqual(['CORS answers any origin (*)']);
    const app = 'https://app.example.com';
    expect(
      checkCorsPreflight({
        origin: app,
        headers: { 'access-control-allow-origin': app, 'access-control-allow-credentials': 'true' },
        isAllowed: true,
      }),
    ).toEqual([]);
    expect(checkCorsPreflight({ origin: app, headers: {}, isAllowed: true })).toEqual([
      `CORS does not grant the allowed origin ${app} (got none)`,
      `CORS does not allow credentials for ${app}`,
    ]);
  });

  it('wants a JSON 404 from an unknown API route, and names what is wrong', () => {
    expect(
      checkErrorEnvelope({
        status: 404,
        contentType: 'application/json; charset=utf-8',
        body: '{"title":"Not Found"}',
      }),
    ).toEqual([]);
    expect(checkErrorEnvelope({ status: 200, contentType: 'text/html', body: '<html>' })).toEqual([
      'an unknown API route answered HTTP 200 (want a JSON 404)',
      'the unknown-route answer is text/html, not JSON — error handler not active',
      'the unknown-route body is not valid JSON — error envelope broken',
    ]);
  });

  it('wants TLS 1.2 or 1.3, a trusted certificate and 14 days left on it', () => {
    const now = new Date('2026-10-17T00:00:00Z');
    expect(
      checkTls({
        protocol: 'TLSv1.3',
        isAuthorized: true,
        validTo: 'Jan 15 00:00:00 2027 GMT',
        now,
      }),
    ).toEqual([]);
    expect(
      checkTls({
        protocol: 'TLSv1.1',
        isAuthorized: false,
        authorizationError: 'CERT_HAS_EXPIRED',
        validTo: 'Oct 20 00:00:00 2026 GMT',
        now,
      }),
    ).toEqual([
      'TLS protocol TLSv1.1 (want TLSv1.2 or TLSv1.3)',
      'certificate is not trusted (CERT_HAS_EXPIRED)',
      'certificate expires Oct 20 00:00:00 2026 GMT (3 days left)',
    ]);
  });
});
