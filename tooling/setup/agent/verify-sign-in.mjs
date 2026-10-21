#!/usr/bin/env node
/**
 * Signs the demo user in the way a person does — send-code, the emailed code, then their own
 * profile — so a bring-up's "live" means the stack is usable, not only healthy: the seed ran, the
 * JWT keys sign, the app's database login works under row-level security.
 *
 *   node tooling/setup/agent/verify-sign-in.mjs [base-url]   # default http://127.0.0.1:${PORT:-3000}
 *
 * The base URL can be the API or clinozy-fe's dev server (Vite proxies /api to the API). The code
 * comes back in the send-code response while TEST_MODE is on (`debug_verification_code`); public
 * auth forms carry the CAPTCHA bypass header (CAPTCHA_BYPASS_HEADER, default X-Captcha-Bypass),
 * which the API honours only where the environment allows it, as clinozy-fe sends it in dev.
 *
 * Exit 0: signed in. Exit 3: skipped — the stack cannot be signed in to from a script (the code is
 * not echoed, CAPTCHA is enforced with no bypass, or the email's rate limit is spent); nothing in
 * the stack is broken. Exit 1: the sign-in failed. Exit 2: an unknown option. Plain Node (fetch);
 * its one import is the repository's command-line parser, which Node runs with its types stripped.
 */
import { parseCommandLine } from '../common/script.ts';

const SIGNED_IN = 0;
const FAILED = 1;
const SKIPPED = 3;
const REQUEST_TIMEOUT_MS = 15_000;

let commandLine;
try {
  commandLine = parseCommandLine({
    args: process.argv.slice(2),
    maxPositionals: 1,
    usage: 'node tooling/setup/agent/verify-sign-in.mjs [base-url]',
  });
} catch (error) {
  console.error(`verify-sign-in: ${error.message}`);
  process.exit(2);
}
const baseUrl = (
  commandLine.positionals[0] ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`
).replace(/\/$/, '');
const email = process.env.VERIFY_SIGN_IN_EMAIL ?? 'demo@example.com';
const captchaBypassHeader = process.env.CAPTCHA_BYPASS_HEADER ?? 'X-Captcha-Bypass';

function report(message) {
  console.log(`verify-sign-in: ${message}`);
}

/** One JSON request; the status and the parsed body (`null` when it is not JSON). */
async function request({ method, path, body, token }) {
  const headers = { Accept: 'application/json', [captchaBypassHeader]: 'true' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
}

/** The response's payload: `data` when the body wraps it, else the body itself. */
function payloadOf(body) {
  if (body !== null && typeof body === 'object' && 'data' in body) return body.data ?? {};
  return body ?? {};
}

function errorOf(body) {
  const error = body?.error;
  return error ? `${error.code ?? '?'}: ${error.detail ?? ''}`.trim() : 'no error body';
}

async function main() {
  const sent = await request({
    method: 'POST',
    path: '/api/v1/auth/email/send-code',
    body: { email },
  });
  if (sent.status === 401 || sent.status === 403) {
    report(
      `skipped — send-code answered ${sent.status} (${errorOf(sent.body)}): CAPTCHA is enforced here without a bypass.`,
    );
    return SKIPPED;
  }
  if (sent.status === 429) {
    report(`skipped — the send-code rate limit for ${email} is spent; try again in a minute.`);
    return SKIPPED;
  }
  if (sent.status !== 200) {
    report(`failed — send-code answered ${sent.status} (${errorOf(sent.body)}).`);
    return FAILED;
  }
  const code = payloadOf(sent.body).debug_verification_code;
  if (typeof code !== 'string' || code.length === 0) {
    report('skipped — the code is not echoed (TEST_MODE is off), so a script cannot sign in.');
    return SKIPPED;
  }

  const login = await request({
    method: 'POST',
    path: '/api/v1/auth/email/login',
    body: { email, code },
  });
  const token = payloadOf(login.body).access_token;
  if (login.status !== 200 || typeof token !== 'string') {
    report(`failed — login answered ${login.status} (${errorOf(login.body)}).`);
    return FAILED;
  }

  const profile = await request({ method: 'GET', path: '/api/v1/users/me', token });
  if (profile.status !== 200) {
    report(`failed — GET /api/v1/users/me answered ${profile.status} (${errorOf(profile.body)}).`);
    return FAILED;
  }
  report(`signed in as ${email} through ${baseUrl} (send-code → login → users/me).`);
  return SIGNED_IN;
}

main().then(
  (exitCode) => process.exit(exitCode),
  (error) => {
    report(`failed — ${baseUrl} did not answer (${error?.cause?.code ?? error?.name ?? error}).`);
    process.exit(FAILED);
  },
);
