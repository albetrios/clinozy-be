import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { user_bug_reports } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.schema.js';
import { users } from '@/domains/user/user.schema.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import {
  injectAuthenticated,
  injectUnauthenticated,
} from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import {
  createMembership,
  createRoleWithPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';

const BUG_REPORTS_PATH = '/users/me/bug-reports';

/**
 * `POST /api/v1/users/me/bug-reports` (iteration feat-bug-report-2026-10-13-dgnx): the frontend's
 * own "Report a bug" — a textbox with a native voice button — files here, and the backend keeps
 * WHO filed it from the session (BR4): the reporter's id, name and email are stamped from their
 * account, and a body that names a reporter is refused.
 */
describe('POST /users/me/bug-reports', () => {
  let application: FastifyInstance;

  beforeAll(async () => {
    const { app: testApplication } = await createTestApp();
    application = testApplication;
  });

  afterAll(async () => {
    await application.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  async function storedRows(userId: number) {
    return getOperatorDatabase()
      .select()
      .from(user_bug_reports)
      .where(eq(user_bug_reports.user_id, userId));
  }

  it('stores the report with the signed-in person stamped from the session', async () => {
    const user = await createTestUser({ firstName: 'Asha', lastName: 'Rao' });
    const token = await generateTestToken({ userId: user.public_id });

    const response = await injectAuthenticated(application, {
      method: 'POST',
      url: testApiPath(BUG_REPORTS_PATH),
      token,
      headers: { 'user-agent': 'BugReportIntegration/1.0' },
      payload: {
        description: '  The invoice total does not update after I remove a line.  ',
        input_method: 'mixed',
        page_path: '/organization/acme/billing',
        app_version: '1.13.0',
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const data = (response.json() as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({
      description: 'The invoice total does not update after I remove a line.',
      input_method: 'mixed',
      page_path: '/organization/acme/billing',
      app_version: '1.13.0',
      user_id: user.public_id,
      reporter_name: 'Asha Rao',
      organization_id: null,
    });
    expect(data.id).toMatch(/^bug_[a-z0-9]{21}$/);
    expect(data).not.toHaveProperty('reporter_email');
    expect(data).not.toHaveProperty('user_agent');

    const rows = await storedRows(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      public_id: data.id,
      user_id: user.id,
      reporter_name: 'Asha Rao',
      reporter_email: user.email,
      organization_public_id: null,
      user_agent: 'BugReportIntegration/1.0',
    });
  });

  it('records the workspace from the token, and a null name when the account has none (BR5)', async () => {
    const user = await createTestUser();
    // An email-code sign-up has no name until onboarding.
    await getOperatorDatabase()
      .update(users)
      .set({ first_name: null, last_name: null })
      .where(eq(users.id, user.id));
    const owner = await createTestUser({ email: `bug-report-owner-${user.public_id}@test.com` });
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [TENANCY_PERMISSIONS.ORGANIZATION_READ],
    });
    await createMembership({ userId: user.id, organizationId: organization.id, roleId: role.id });
    const token = await generateTestToken({
      userId: user.public_id,
      organizationPublicId: organization.public_id,
    });

    const response = await injectAuthenticated(application, {
      method: 'POST',
      url: testApiPath(BUG_REPORTS_PATH),
      token,
      payload: { description: 'The calendar froze', input_method: 'voice' },
    });

    expect(response.statusCode, response.body).toBe(200);
    const data = (response.json() as { data: Record<string, unknown> }).data;
    expect(data.organization_id).toBe(organization.public_id);
    expect(data.reporter_name).toBeNull();
    const [row] = await storedRows(user.id);
    expect(row?.organization_public_id).toBe(organization.public_id);
    expect(row?.reporter_email).toBe(user.email);
  });

  // BR4: nobody files under someone else's name.
  it('refuses a body that names a reporter, and stores nothing', async () => {
    const user = await createTestUser();
    const victim = await createTestUser();
    const token = await generateTestToken({ userId: user.public_id });

    const response = await injectAuthenticated(application, {
      method: 'POST',
      url: testApiPath(BUG_REPORTS_PATH),
      token,
      payload: {
        description: 'Spoofed',
        input_method: 'typed',
        user_id: victim.public_id,
        name: 'Someone Else',
      },
    });

    expect(response.statusCode, response.body).toBe(400);
    expect(await storedRows(user.id)).toHaveLength(0);
    expect(await storedRows(victim.id)).toHaveLength(0);
  });

  it('refuses a blank description, an unknown input method and a non-path page', async () => {
    const user = await createTestUser();
    const token = await generateTestToken({ userId: user.public_id });

    for (const payload of [
      { description: '   ', input_method: 'typed' },
      { description: 'Froze', input_method: 'telepathy' },
      { description: 'Froze', input_method: 'typed', page_path: 'https://example.com' },
    ]) {
      const response = await injectAuthenticated(application, {
        method: 'POST',
        url: testApiPath(BUG_REPORTS_PATH),
        token,
        payload,
      });
      expect(response.statusCode, response.body).toBe(400);
    }
    expect(await storedRows(user.id)).toHaveLength(0);
  });

  it('is a 401 without a session', async () => {
    const response = await injectUnauthenticated(application, {
      method: 'POST',
      url: testApiPath(BUG_REPORTS_PATH),
      payload: { description: 'Froze', input_method: 'typed' },
    });

    expect(response.statusCode).toBe(401);
  });
});
