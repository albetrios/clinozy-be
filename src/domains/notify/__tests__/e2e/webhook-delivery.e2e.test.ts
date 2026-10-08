import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import {
  seedPermissions,
  createRoleWithPermissions,
  createMembership,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import type { FastifyInstance } from 'fastify';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

const WEBHOOK_PERMISSIONS = ['webhook:read', 'webhook:manage'];
const mockedLookup = vi.mocked(lookup);

function mockWebhookDnsLookup(): void {
  mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as unknown as Awaited<
    ReturnType<typeof lookup>
  >);
}

describe('Notify e2e: webhook subscriptions', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    mockedLookup.mockReset();
    mockWebhookDnsLookup();
    await cleanupDatabase();
    await seedPermissions(WEBHOOK_PERMISSIONS);
  });

  it('creates webhook and lists webhooks', async () => {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: WEBHOOK_PERMISSIONS,
    });
    await createMembership({
      userId: user.id,
      organizationId: organization.id,
      roleId: role.id,
    });
    // Flat webhook routes resolve the organization from the JWT `org` claim.
    const token = await generateTestToken({
      userId: user.public_id,
      organizationPublicId: organization.public_id,
    });

    const createResponse = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/notify/webhooks'),
      token,
      payload: {
        url: 'https://example.com/webhook',
        events: ['subscription.created'],
      },
      headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
    });
    expect(createResponse.statusCode, createResponse.body).toBe(200);
    const created = (
      createResponse.json() as { data: { id: string; url: string; events: string[] } }
    ).data;
    expect(created.id).toMatch(/^whk_[a-z0-9]{21}$/);
    expect(created.url).toBe('https://example.com/webhook');
    expect(created.events).toEqual(['subscription.created']);

    const listResponse = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath('/notify/webhooks'),
      token,
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json() as {
      data: { id: string; url: string; events: string[] }[];
      meta?: { pagination?: { has_more?: boolean; next?: string | null } };
    };
    expect(listBody.meta?.pagination).toMatchObject({ has_more: false, next: null });
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0]).toMatchObject({
      id: created.id,
      url: created.url,
      events: created.events,
    });
  });
});
