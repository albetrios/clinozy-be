/**
 * Live probe of a deployed API: security headers, CORS and TLS, from outside — after each
 * Railway deploy and, for the development API, before a production release
 * (`.github/actions/probe-live-api`).
 *
 * Usage:
 *   pnpm ops:probe-live-api --url https://api.example.com [--allowed-origin https://app.example.com]
 *
 * Headers come from an unknown API route (it passes the whole plugin chain): HSTS of at least 180
 * days, `nosniff`, a CSP with `frame-ancestors 'none'`, a referrer policy, a cross-origin
 * resource policy, no `X-Powered-By`. CORS: a preflight from an origin the API must not trust
 * gets no `Access-Control-Allow-Origin` for it (nor `*`); the allowed origin, when given, gets
 * itself back with credentials. TLS: 1.2 or 1.3, a trusted certificate, at least 14 days left.
 * Warn-only until `EARLY_CHECKS_BLOCK_FROM` (`src/scripts/tooling/early-checks.util.ts`).
 */
import { connect } from 'node:tls';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportEarlyCheck } from '@/scripts/tooling/early-checks.util.js';

/** 180 days — the shortest HSTS max-age the probe accepts (the API sends one year). */
const MINIMUM_HSTS_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
/** A certificate with fewer days left than this is a finding. */
const MINIMUM_CERTIFICATE_DAYS = 14;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
/** An origin no deployment lists in ALLOWED_ORIGINS (`.invalid` is reserved, RFC 2606). */
const UNTRUSTED_ORIGIN = 'https://cors-probe.invalid';
const REQUEST_TIMEOUT_MILLISECONDS = 15_000;

/** Response headers with lower-case names. */
export type ResponseHeaders = Readonly<Record<string, string>>;

/** The findings on one response's security headers. */
export function checkSecurityHeaders(headers: ResponseHeaders): string[] {
  const findings: string[] = [];
  const hsts = headers['strict-transport-security'];
  const maxAge = Number(/max-age=(\d+)/i.exec(hsts ?? '')?.[1] ?? Number.NaN);
  if (!hsts) findings.push('no Strict-Transport-Security header');
  else if (!(maxAge >= MINIMUM_HSTS_MAX_AGE_SECONDS)) {
    findings.push(`HSTS max-age ${Number.isNaN(maxAge) ? 'missing' : maxAge} is under 180 days`);
  }
  if (headers['x-content-type-options']?.toLowerCase() !== 'nosniff') {
    findings.push('X-Content-Type-Options is not nosniff');
  }
  const contentSecurityPolicy = headers['content-security-policy'];
  if (!contentSecurityPolicy) findings.push('no Content-Security-Policy header');
  else if (!/frame-ancestors\s+'none'/i.test(contentSecurityPolicy)) {
    findings.push("Content-Security-Policy has no frame-ancestors 'none'");
  }
  if (!headers['referrer-policy']) findings.push('no Referrer-Policy header');
  if (!headers['cross-origin-resource-policy'])
    findings.push('no Cross-Origin-Resource-Policy header');
  if (headers['x-powered-by']) findings.push(`X-Powered-By is sent (${headers['x-powered-by']})`);
  return findings;
}

/** The findings on one CORS preflight answer: `origin` must be granted exactly when it is allowed. */
export function checkCorsPreflight(options: {
  origin: string;
  headers: ResponseHeaders;
  isAllowed: boolean;
}): string[] {
  const grantedOrigin = options.headers['access-control-allow-origin'];
  const allowsCredentials = options.headers['access-control-allow-credentials'] === 'true';
  if (!options.isAllowed) {
    if (grantedOrigin === '*') return ['CORS answers any origin (*)'];
    if (grantedOrigin === options.origin) {
      return [`CORS grants an origin it must not trust (${options.origin})`];
    }
    return [];
  }
  const findings: string[] = [];
  if (grantedOrigin !== options.origin) {
    findings.push(
      `CORS does not grant the allowed origin ${options.origin} (got ${grantedOrigin ?? 'none'})`,
    );
  }
  if (!allowsCredentials) findings.push(`CORS does not allow credentials for ${options.origin}`);
  return findings;
}

/** The findings on a TLS handshake: protocol, trust, days left on the certificate. */
export function checkTls(options: {
  protocol: string | null;
  isAuthorized: boolean;
  authorizationError?: string | undefined;
  validTo?: string | undefined;
  now: Date;
}): string[] {
  const findings: string[] = [];
  if (options.protocol !== 'TLSv1.2' && options.protocol !== 'TLSv1.3') {
    findings.push(`TLS protocol ${options.protocol ?? 'unknown'} (want TLSv1.2 or TLSv1.3)`);
  }
  if (!options.isAuthorized) {
    findings.push(`certificate is not trusted (${options.authorizationError ?? 'unknown reason'})`);
  }
  if (options.validTo) {
    const daysLeft = Math.floor(
      (Date.parse(options.validTo) - options.now.getTime()) / MILLISECONDS_PER_DAY,
    );
    if (!(daysLeft >= MINIMUM_CERTIFICATE_DAYS)) {
      findings.push(`certificate expires ${options.validTo} (${daysLeft} days left)`);
    }
  }
  return findings;
}

function headersOf(response: Response): ResponseHeaders {
  return Object.fromEntries(
    [...response.headers].map(([name, value]) => [name.toLowerCase(), value]),
  );
}

function preflight(options: { url: string; origin: string }): Promise<Response> {
  return fetch(options.url, {
    method: 'OPTIONS',
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    headers: {
      Origin: options.origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
}

function handshake(target: URL): Promise<Parameters<typeof checkTls>[0]> {
  return new Promise((resolveHandshake, rejectHandshake) => {
    const socket = connect({
      host: target.hostname,
      port: Number(target.port || 443),
      servername: target.hostname,
      rejectUnauthorized: false,
      timeout: REQUEST_TIMEOUT_MILLISECONDS,
    });
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate();
      resolveHandshake({
        protocol: socket.getProtocol(),
        isAuthorized: socket.authorized,
        authorizationError: socket.authorizationError?.message,
        validTo: certificate.valid_to,
        now: new Date(),
      });
      socket.end();
    });
    socket.once('timeout', () => socket.destroy(new Error('TLS handshake timed out')));
    socket.once('error', rejectHandshake);
  });
}

async function probe(options: {
  baseUrl: string;
  allowedOrigin?: string | undefined;
}): Promise<string[]> {
  const findings: string[] = [];
  const target = new URL(options.baseUrl);
  if (target.protocol !== 'https:') findings.push(`${options.baseUrl} is not HTTPS`);
  else {
    try {
      findings.push(...checkTls(await handshake(target)));
    } catch (error) {
      findings.push(`TLS handshake failed: ${(error as Error).message}`);
    }
  }
  const apiUrl = (path: string) => new URL(path, target).toString();
  try {
    const response = await fetch(apiUrl('/api/v1/__post_deploy_probe__'), {
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
    findings.push(...checkSecurityHeaders(headersOf(response)));
    const untrusted = await preflight({
      url: apiUrl('/api/v1/auth/refresh'),
      origin: UNTRUSTED_ORIGIN,
    });
    findings.push(
      ...checkCorsPreflight({
        origin: UNTRUSTED_ORIGIN,
        headers: headersOf(untrusted),
        isAllowed: false,
      }),
    );
    if (options.allowedOrigin) {
      const allowed = await preflight({
        url: apiUrl('/api/v1/auth/refresh'),
        origin: options.allowedOrigin,
      });
      findings.push(
        ...checkCorsPreflight({
          origin: options.allowedOrigin,
          headers: headersOf(allowed),
          isAllowed: true,
        }),
      );
    }
  } catch (error) {
    findings.push(`could not reach ${options.baseUrl}: ${(error as Error).message}`);
  }
  return findings;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value?.trim() ? value.trim() : undefined;
}

async function main(): Promise<void> {
  const baseUrl = option('--url') ?? process.env.API_BASE_URL;
  if (!baseUrl) {
    console.error(
      'Usage: pnpm ops:probe-live-api --url <https://api…> [--allowed-origin <origin>]',
    );
    process.exitCode = 1;
    return;
  }
  const allowedOrigin = option('--allowed-origin');
  const findings = await probe({ baseUrl, allowedOrigin });
  process.exitCode = reportEarlyCheck({
    check: `Live API probe (${new URL(baseUrl).host})`,
    findings,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main();
}
