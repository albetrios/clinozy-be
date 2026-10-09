import { browserApi, expect, login, test } from '@tooling/playwright/helpers/browser-harness.js';

test.beforeEach(async ({ page, harness }) => {
  await page.goto(harness.origin);
});

test('positive: allowed-origin credentialed login returns a bearer', async ({ page, harness }) => {
  await login({ page, harness });
});

test('negative: incorrect password is rejected', async ({ page, harness }) => {
  const result = await browserApi({
    page,
    apiUrl: harness.apiUrl,
    path: '/auth/login',
    method: 'POST',
    body: { email: harness.actor.email, password: `${harness.actor.password}-incorrect` },
  });
  expect(result.status).toBe(401);
});

test('negative: missing login fields are rejected', async ({ page, harness }) => {
  const result = await browserApi({
    page,
    apiUrl: harness.apiUrl,
    path: '/auth/login',
    method: 'POST',
    body: {},
  });
  expect(result.status).toBe(400);
});

test('negative: absent bearer is rejected', async ({ page, harness }) => {
  expect((await browserApi({ page, apiUrl: harness.apiUrl, path: '/users/me' })).status).toBe(401);
});

test('negative: malformed bearer is rejected', async ({ page, harness }) => {
  expect(
    (await browserApi({ page, apiUrl: harness.apiUrl, path: '/users/me', token: 'malformed' }))
      .status,
  ).toBe(401);
});

test('positive: session is HttpOnly and scoped to the auth path', async ({
  page,
  context,
  harness,
}) => {
  await login({ page, harness });
  const session = (await context.cookies()).find((cookie) => cookie.name === 'session_id');
  expect(session).toBeDefined();
  expect(session?.httpOnly).toBe(true);
  expect(session?.path).toBe('/api/v1/auth');
  await page.goto(`${harness.origin}/api/v1/auth`);
  expect(await page.evaluate('document.cookie')).not.toContain('session_id=');
});

test('positive: allowed-origin session refresh succeeds in the browser', async ({
  page,
  harness,
}) => {
  await login({ page, harness });
  const result = await browserApi({
    page,
    apiUrl: harness.apiUrl,
    path: '/auth/refresh',
    method: 'POST',
    body: {},
  });
  expect(result.status).toBe(200);
  expect(typeof result.data?.access_token).toBe('string');
});

test('positive: organization switch binds the authenticated context', async ({ page, harness }) => {
  const token = await login({ page, harness });
  const switched = await browserApi({
    page,
    apiUrl: harness.apiUrl,
    path: '/auth/switch-to-organization',
    method: 'POST',
    token,
    body: { organization_id: harness.actor.organizationPublicId },
  });
  expect(switched.status).toBe(200);
  const result = await browserApi({
    page,
    apiUrl: harness.apiUrl,
    path: '/auth/me/context',
    token: String(switched.data?.access_token),
  });
  expect(result.status).toBe(200);
  expect(result.data?.user).toMatchObject({ id: harness.actor.userPublicId });
  expect(result.data?.active_organization).toMatchObject({
    id: harness.actor.organizationPublicId,
  });
});

test('negative: foreign organization switch is denied', async ({ page, harness }) => {
  const token = await login({ page, harness });
  const result = await browserApi({
    page,
    apiUrl: harness.apiUrl,
    path: '/auth/switch-to-organization',
    method: 'POST',
    token,
    body: { organization_id: harness.foreignOrganization },
  });
  expect([403, 404]).toContain(result.status);
});

test('negative: disallowed origin cannot read a credentialed API response', async ({
  page,
  harness,
}) => {
  await login({ page, harness });
  await page.goto(harness.deniedOrigin);
  await expect(
    browserApi({ page, apiUrl: harness.apiUrl, path: '/auth/refresh', method: 'POST', body: {} }),
  ).rejects.toThrow();
});

test('negative: originless cookie refresh requires a valid CSRF token', async ({
  page,
  context,
  harness,
}) => {
  await login({ page, harness });
  const response = await context.request.post(`${harness.apiUrl}/api/v1/auth/refresh`, {
    data: {},
  });
  expect(response.status()).toBe(403);
});

test('negative: mismatched double-submit CSRF token is denied', async ({
  page,
  context,
  harness,
}) => {
  await login({ page, harness });
  const response = await context.request.post(`${harness.apiUrl}/api/v1/auth/refresh`, {
    data: {},
    headers: { 'x-csrf-token': 'incorrect-csrf' },
  });
  expect(response.status()).toBe(403);
});

test('positive: matching double-submit CSRF token permits originless refresh', async ({
  page,
  context,
  harness,
}) => {
  await login({ page, harness });
  const csrf = (await context.cookies()).find((cookie) => cookie.name === 'csrf_token');
  expect(csrf).toBeDefined();
  const response = await context.request.post(`${harness.apiUrl}/api/v1/auth/refresh`, {
    data: {},
    headers: { 'x-csrf-token': csrf?.value ?? '' },
  });
  expect(response.status()).toBe(200);
});

test('positive and negative: logout revokes the bearer and cookie session', async ({
  page,
  harness,
}) => {
  const token = await login({ page, harness });
  const logout = await browserApi({
    page,
    apiUrl: harness.apiUrl,
    path: '/auth/logout',
    method: 'POST',
    body: {},
    token,
  });
  expect(logout.status).toBe(200);
  expect(
    (await browserApi({ page, apiUrl: harness.apiUrl, path: '/users/me', token })).status,
  ).toBe(401);
  expect(
    (
      await browserApi({
        page,
        apiUrl: harness.apiUrl,
        path: '/auth/refresh',
        method: 'POST',
        body: {},
      })
    ).status,
  ).toBe(401);
});
