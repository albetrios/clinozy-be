import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

const servers: Server[] = [];

type Answer = { status: number; body: unknown };

/** An API stand-in: one answer per sign-in route; records the CAPTCHA bypass header it saw. */
async function startApi(answers: {
  sendCode: Answer;
  login?: Answer;
  profile?: Answer;
}): Promise<{ port: number; bypassHeaders: string[] }> {
  const bypassHeaders: string[] = [];
  const server = createServer((request, response) => {
    bypassHeaders.push(String(request.headers['x-captcha-bypass'] ?? ''));
    const routes: Record<string, Answer | undefined> = {
      'POST /api/v1/auth/email/send-code': answers.sendCode,
      'POST /api/v1/auth/email/login': answers.login,
      'GET /api/v1/users/me': answers.profile,
    };
    const answer = routes[`${request.method} ${request.url}`] ?? { status: 404, body: {} };
    response.statusCode = answer.status;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(answer.body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: (server.address() as AddressInfo).port, bypassHeaders };
}

function verify(baseUrl: string): Promise<{ status: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['tooling/setup/agent/verify-sign-in.mjs', baseUrl]);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.on('close', (status) => resolve({ status, output }));
  });
}

const codeSent: Answer = { status: 200, body: { data: { debug_verification_code: 'ABC123' } } };
const signedIn: Answer = { status: 200, body: { data: { access_token: 'token' } } };

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

/**
 * The bring-up's last step (bootstrap.sh step 10, `pnpm dev:stack:verify`): "live" means the demo
 * user signs in. A stack that cannot be signed in to from a script is a skip (exit 3), never a
 * false failure; anything else that goes wrong is a failure (exit 1).
 */
describe('tooling/setup/agent/verify-sign-in.mjs', () => {
  it('signs in: send-code, the echoed code, then the profile', async () => {
    const api = await startApi({
      sendCode: codeSent,
      login: signedIn,
      profile: { status: 200, body: { data: { id: 'usr_1' } } },
    });

    const result = await verify(`http://127.0.0.1:${api.port}`);

    expect(result.status).toBe(0);
    expect(result.output).toContain('signed in as demo@example.com');
    // Public auth forms carry the CAPTCHA bypass header, as clinozy-fe sends it in development.
    expect(api.bypassHeaders).toEqual(['true', 'true', 'true']);
  });

  it.each([
    [
      'the code is not echoed (TEST_MODE off)',
      { status: 200, body: { data: { message: 'sent' } } },
    ],
    [
      'CAPTCHA is enforced without a bypass',
      { status: 401, body: { error: { code: 'unauthorized' } } },
    ],
    ['the email rate limit is spent', { status: 429, body: {} }],
  ])('skips when %s', async (_case, sendCode) => {
    const api = await startApi({ sendCode });

    const result = await verify(`http://127.0.0.1:${api.port}`);

    expect(result.status).toBe(3);
    expect(result.output).toContain('skipped');
  });

  it.each([
    ['send-code errors', { sendCode: { status: 500, body: {} } }],
    ['the login is rejected', { sendCode: codeSent, login: { status: 401, body: {} } }],
    [
      'the profile errors',
      { sendCode: codeSent, login: signedIn, profile: { status: 500, body: {} } },
    ],
  ])('fails when %s', async (_case, answers) => {
    const api = await startApi(answers);

    const result = await verify(`http://127.0.0.1:${api.port}`);

    expect(result.status).toBe(1);
    expect(result.output).toContain('failed');
  });

  it('fails when nothing answers', async () => {
    const result = await verify('http://127.0.0.1:1');

    expect(result.status).toBe(1);
    expect(result.output).toContain('did not answer');
  });
});
