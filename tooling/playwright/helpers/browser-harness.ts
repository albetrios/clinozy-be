import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { test as base, expect, type Page } from '@playwright/test';

interface Actor {
  email: string;
  password: string;
  organizationPublicId: string;
  userPublicId: string;
}

interface BrowserHarness {
  apiUrl: string;
  origin: string;
  deniedOrigin: string;
  actor: Actor;
  foreignOrganization: string;
}

interface ApiCall {
  page: Page;
  apiUrl: string;
  path: string;
  method?: string;
  body?: unknown;
  token?: string;
}

/** Sends a credentialed request from the real browser's current origin. */
export async function browserApi(options: ApiCall): Promise<{
  status: number;
  data: Record<string, unknown> | null;
}> {
  return options.page.evaluate(
    async ({ apiUrl, path, method, body, token }) => {
      const response = await fetch(`${apiUrl}/api/v1${path}`, {
        method: method ?? 'GET',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': crypto.randomUUID(),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const raw = await response.text();
      return { status: response.status, data: raw ? (JSON.parse(raw).data ?? null) : null };
    },
    {
      apiUrl: options.apiUrl,
      path: options.path,
      method: options.method,
      body: options.body,
      token: options.token,
    },
  );
}

/** Obtains a short-lived bearer for a synthetic account through browser login. */
export async function login(options: { page: Page; harness: BrowserHarness }): Promise<string> {
  const result = await browserApi({
    page: options.page,
    apiUrl: options.harness.apiUrl,
    path: '/auth/login',
    method: 'POST',
    body: { email: options.harness.actor.email, password: options.harness.actor.password },
  });
  expect(result.status).toBe(200);
  const token = result.data?.access_token;
  expect(typeof token).toBe('string');
  if (typeof token !== 'string') throw new Error('Browser login did not return a bearer');
  return token;
}

async function startHarness(origin: string): Promise<Server> {
  const url = new URL(origin);
  if (url.hostname !== 'localhost' || url.protocol !== 'http:') {
    throw new Error('Local browser harness requires an http://localhost origin');
  }
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    response.end(
      '<!doctype html><html lang="en"><title>Backend browser contract harness</title><body><h1>Local backend browser contracts</h1><p>Synthetic accounts; provider challenges are separate.</p></body></html>',
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(url.port), '127.0.0.1', resolve);
  });
  return server;
}

/** Local contract fixture; requires independently started isolated backend and seeded actors. */
export const test = base.extend<{ harness: BrowserHarness }>({
  harness: async ({ browserName }, use) => {
    if (browserName !== 'chromium')
      throw new Error('The verified local contract matrix uses Chromium');
    const apiUrl = process.env.BROWSER_TEST_API_URL;
    const actorFile = process.env.BROWSER_TEST_CREDENTIAL_POOL;
    if (!(apiUrl && actorFile)) {
      throw new Error(
        'Set BROWSER_TEST_API_URL and BROWSER_TEST_CREDENTIAL_POOL for an owned isolated backend',
      );
    }
    const api = new URL(apiUrl);
    if (api.hostname !== 'localhost' || api.protocol !== 'http:') {
      throw new Error(
        'This suite verifies local HTTP contracts; trusted HTTPS/provider testing is separate',
      );
    }
    const actors: Actor[] = JSON.parse(readFileSync(actorFile, 'utf8'));
    const actor = actors[0];
    const foreignActor = actors.find(
      (candidate) => candidate.organizationPublicId !== actor?.organizationPublicId,
    );
    if (!(actor && foreignActor)) throw new Error('Two synthetic tenants are required');
    const harness = {
      apiUrl: api.origin,
      origin: process.env.BROWSER_TEST_ORIGIN ?? 'http://localhost:5175',
      deniedOrigin: process.env.BROWSER_TEST_DENIED_ORIGIN ?? 'http://localhost:5176',
      actor,
      foreignOrganization: foreignActor.organizationPublicId,
    };
    const health = await fetch(`${harness.apiUrl}/readyz`);
    if (!health.ok) throw new Error(`Isolated backend preflight failed: ${health.status}`);
    const allowedServer = await startHarness(harness.origin);
    let deniedServer: Server | undefined;
    try {
      deniedServer = await startHarness(harness.deniedOrigin);
      await use(harness);
    } finally {
      await Promise.all(
        [allowedServer, deniedServer]
          .filter((server) => server !== undefined)
          .map(
            (server) =>
              new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
              ),
          ),
      );
    }
  },
});

export { expect };
