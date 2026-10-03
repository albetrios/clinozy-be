import { describe, expect, it } from 'vitest';
import { createLoopbackGuard } from '@tooling/dev/loopback-guard.mjs';
import {
  redactBody,
  redactHeaders,
  redactQuery,
} from '@tooling/load-test-monitor/lib/recording-redaction.mjs';

const PORT = 4985;

function request(headers: Record<string, string>, url = '/__monitor/calls') {
  return { headers, url };
}

describe('loopback guard (DB Viewer, Load Testing Monitoring)', () => {
  const guard = createLoopbackGuard({ port: PORT });

  it('admits a loopback request carrying the session token as a header or query parameter', () => {
    const byHeader = request({ host: `127.0.0.1:${PORT}`, 'x-session-token': guard.sessionToken });
    const byQuery = request(
      { host: `localhost:${PORT}` },
      `/__monitor/stream?token=${guard.sessionToken}`,
    );
    expect(guard.rejectionFor(byHeader, { requireSessionToken: true })).toBeNull();
    expect(guard.rejectionFor(byQuery, { requireSessionToken: true })).toBeNull();
  });

  it('refuses a missing or wrong session token', () => {
    expect(
      guard.rejectionFor(request({ host: `127.0.0.1:${PORT}` }), { requireSessionToken: true }),
    ).toEqual({ status: 403, error: 'Missing or invalid session token' });
    expect(
      guard.rejectionFor(
        request({ host: `127.0.0.1:${PORT}`, 'x-session-token': 'a'.repeat(32) }),
        { requireSessionToken: true },
      ),
    ).toEqual({ status: 403, error: 'Missing or invalid session token' });
  });

  it('refuses a rebound Host even with the token (DNS rebinding)', () => {
    const rebound = request({
      host: `attacker.example:${PORT}`,
      'x-session-token': guard.sessionToken,
    });
    expect(guard.rejectionFor(rebound, { requireSessionToken: true })).toEqual({
      status: 403,
      error: 'Invalid Host',
    });
    // The Host check holds even where no token is required (the monitor's proxy path).
    expect(guard.rejectionFor(rebound, { requireSessionToken: false, checkOrigin: false })).toEqual(
      {
        status: 403,
        error: 'Invalid Host',
      },
    );
  });

  it('refuses a cross-origin browser page but admits clients that send no Origin', () => {
    const crossOrigin = request({ host: `127.0.0.1:${PORT}`, origin: 'http://attacker.example' });
    expect(guard.rejectionFor(crossOrigin, { requireSessionToken: false })).toEqual({
      status: 403,
      error: 'Origin not allowed',
    });
    expect(
      guard.rejectionFor(request({ host: `127.0.0.1:${PORT}` }), { requireSessionToken: false }),
    ).toBeNull();
  });

  it('announces a loopback URL that carries this boot’s token', () => {
    expect(guard.announcedUrl()).toBe(`http://127.0.0.1:${PORT}/?token=${guard.sessionToken}`);
    expect(createLoopbackGuard({ port: PORT }).sessionToken).not.toBe(guard.sessionToken);
  });
});

describe('Load Testing Monitoring — what a recorded call may keep', () => {
  it('redacts credentials in a JSON login body at any depth', () => {
    const body = Buffer.from(
      JSON.stringify({
        email: 'person@example.com',
        password: 'Sup3rSecret!',
        nested: { access_token: 'eyJhbGciOi.payload.signature', label: 'kept' },
      }),
    );
    const recorded = redactBody(body, 'application/json');
    expect(recorded).not.toContain('Sup3rSecret!');
    expect(recorded).not.toContain('eyJhbGciOi');
    expect(recorded).not.toContain('person@example.com');
    expect(JSON.parse(recorded)).toMatchObject({ nested: { label: 'kept' } });
  });

  it('redacts form-encoded secrets and sensitive query parameters', () => {
    const form = redactBody(
      Buffer.from('username=a&password=hunter22'),
      'application/x-www-form-urlencoded',
    );
    expect(form).not.toContain('hunter22');
    expect(redactQuery('?token=abc123&page=2')).not.toContain('abc123');
    expect(redactQuery('?token=abc123&page=2')).toContain('page=2');
  });

  it('withholds a body it cannot parse rather than store it raw', () => {
    const truncated = Buffer.from('{"password":"Sup3rSecret!","refresh_tok');
    const recorded = redactBody(truncated, 'application/json');
    expect(recorded).not.toContain('Sup3rSecret!');
    expect(recorded).toMatch(/^\[body withheld: \d+ bytes/);
    // Non-JSON text naming a sensitive field is withheld too.
    expect(redactBody(Buffer.from('password=hunter22'), 'text/plain')).toMatch(/^\[body withheld/);
    // Harmless text is kept.
    expect(redactBody(Buffer.from('<h1>Service Unavailable</h1>'), 'text/html')).toBe(
      '<h1>Service Unavailable</h1>',
    );
  });

  it('keeps a non-reusable bearer fingerprint and redacts every other sensitive header', () => {
    const bearer = `eyJ${'x'.repeat(120)}`;
    const headers = redactHeaders({
      authorization: `Bearer ${bearer}`,
      'x-api-key': 'ak_live_should_never_be_recorded',
      'x-captcha-token': 'captcha-token-value',
      'content-type': 'application/json',
    });
    expect(headers.authorization).not.toContain(bearer);
    expect(headers.authorization).toMatch(/^Bearer .{12}….{8} \(\d+ chars\)$/);
    expect(headers['x-api-key']).toBe('[redacted]');
    expect(headers['x-captcha-token']).toBe('[redacted]');
    expect(headers['content-type']).toBe('application/json');
  });
});
