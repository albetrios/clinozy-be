import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { generateSuperAdminToken } from '@/tests/helpers/test-auth.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedAllPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';

type PaginatedBody<T> = {
  data: T[];
  meta?: { pagination?: { next: string | null; has_more: boolean } };
};

describe('Cursor pagination — integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('GET /organizations pages forward with after cursor', async () => {
    const owner = await createTestUser();
    const token = await generateSuperAdminToken(owner.public_id);
    await createTestOrganization({ ownerUserId: owner.id, name: 'Org Alpha' });
    await createTestOrganization({ ownerUserId: owner.id, name: 'Org Beta' });

    const firstPage = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath('/users/me/organizations'),
      token,
      query: { limit: '1' },
    });
    expect(firstPage.statusCode).toBe(200);
    const firstBody = firstPage.json() as PaginatedBody<{ id: string }>;
    expect(firstBody.data).toHaveLength(1);
    expect(firstBody.meta?.pagination?.has_more).toBe(true);
    const nextCursor = firstBody.meta?.pagination?.next;
    expect(nextCursor).toBeTruthy();

    const secondPage = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath('/users/me/organizations'),
      token,
      query: { limit: '1', after: nextCursor ?? '' },
    });
    expect(secondPage.statusCode).toBe(200);
    const secondBody = secondPage.json() as PaginatedBody<{ id: string }>;
    expect(secondBody.data).toHaveLength(1);
    expect(secondBody.data[0]?.id).not.toBe(firstBody.data[0]?.id);
  });

  it('GET /users/me/organizations rejects a page query parameter (cursor-only, strict query)', async () => {
    const owner = await createTestUser();
    const token = await generateSuperAdminToken(owner.public_id);
    await createTestOrganization({ ownerUserId: owner.id });

    const response = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath('/users/me/organizations'),
      token,
      query: { page: '1', limit: '10' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      error: { type: string; errors?: Array<{ field: string; message: string }> };
    };
    // `page` is not a list parameter: the strict query schema refuses it like any unknown key,
    // naming it as the field.
    expect(body.error.type).toBe('validation_error');
    expect(body.error.errors).toEqual([
      { field: 'querystring.page', message: 'Unrecognized key: "page"' },
    ]);
  });
  it.each(['asc', 'desc'] as const)(
    'membership pages preserve PostgreSQL microseconds in %s order, even after boundary deletion',
    async (order) => {
      await seedAllPermissions();
      const owner = await createTestUser();
      const organization = await createTestOrganization({ ownerUserId: owner.id });
      const role = await createRoleWithPermissions({
        organizationId: organization.id,
        permissionCodes: ['membership:read'],
      });
      await createMembership({
        userId: owner.id,
        organizationId: organization.id,
        roleId: role.id,
      });
      const database = getOperatorDatabase();
      // Deliberately disagree with id order within the same millisecond and include
      // an exact timestamp tie: only (full timestamp, id) gives the correct page.
      for (const fraction of ['000900', '000100', '000700', '000100', '000200', '001000']) {
        const member = await createTestUser();
        const membership = await createMembership({
          userId: member.id,
          organizationId: organization.id,
          roleId: role.id,
        });
        await database.execute(
          sql`UPDATE tenancy.memberships SET created_at = ${`2026-01-01T00:00:00.${fraction}Z`}::timestamptz WHERE id = ${membership.id}`,
        );
      }
      const expectedRows = await database.execute<{ public_id: string }>(
        order === 'asc'
          ? sql`SELECT public_id FROM tenancy.memberships WHERE organization_id=${organization.id} ORDER BY created_at ASC, id ASC`
          : sql`SELECT public_id FROM tenancy.memberships WHERE organization_id=${organization.id} ORDER BY created_at DESC, id DESC`,
      );
      const expectedIds = [...expectedRows].map((row) => row.public_id);
      const token = await generateTestToken({
        userId: owner.public_id,
        organizationPublicId: organization.public_id,
      });
      const observed: string[] = [];
      let after: string | undefined;
      let finished = false;
      for (let page = 0; page < 8; page += 1) {
        const response = await injectAuthenticated(app, {
          method: 'GET',
          url: testApiPath('/tenancy/organization/memberships'),
          token,
          query: { limit: '2', order, ...(after ? { after } : {}) },
        });
        expect(response.statusCode).toBe(200);
        const body = response.json() as PaginatedBody<{ id: string }>;
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data.every((row) => !observed.includes(row.id))).toBe(true);
        observed.push(...body.data.map((row) => row.id));
        if (page === 0) {
          // The next cursor must retain its sort position without a database lookup
          // of the boundary row. A hard deletion cannot reset or truncate the page.
          await database.execute(
            sql`DELETE FROM tenancy.memberships WHERE public_id=${body.data.at(-1)?.id}`,
          );
        }
        after = body.meta?.pagination?.next ?? undefined;
        if (!after) {
          finished = true;
          break;
        }
      }
      expect(finished).toBe(true);
      expect(observed).toEqual(expectedIds);
    },
  );
});
