import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import {
  injectAuthenticated,
  injectUnauthenticated,
} from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestBranch, grantTestBranchUserAccess } from '@/tests/factories/branches.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import {
  seedPermissions,
  createRoleWithPermissions,
  createMembership,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';

const ALL_BRANCH_PERMISSIONS = Object.values(APP_PERMISSIONS);
const UNKNOWN_BRANCH_ID = 'brn_aaaaaaaaaaaaaaaaaaaaa';

const VALID_BRANCH = {
  name: 'Adajan',
  address_line_one: '12 Anand Mahal Road',
  area: 'Adajan',
  city: 'Surat',
  postal_code: '395009',
  phone: '+919825012345',
  email: 'adajan@example.com',
};

type BranchBody = { data: Record<string, unknown> };
type BranchListBody = { data: Array<Record<string, unknown>> };

describe('Branches — Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedPermissions([TENANCY_PERMISSIONS.ORGANIZATION_READ, ...ALL_BRANCH_PERMISSIONS]);
  });

  type Organization = Awaited<ReturnType<typeof createTestOrganization>>;

  /** A member of `organization` holding `permissionCodes` (organization:read always). */
  async function memberWith(permissionCodes: readonly string[], organization: Organization) {
    const user = await createTestUser();
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [TENANCY_PERMISSIONS.ORGANIZATION_READ, ...permissionCodes],
    });
    const membership = await createMembership({
      userId: user.id,
      organizationId: organization.id,
      roleId: role.id,
    });
    const token = await generateTestToken({
      userId: user.public_id,
      organizationPublicId: organization.public_id,
    });
    return { user, membership, token };
  }

  /** An organization with an admin holding every branch code. */
  async function adminContext() {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const admin = await memberWith(ALL_BRANCH_PERMISSIONS, organization);
    return { organization, admin, token: admin.token };
  }

  describe('GET /app/branches/my', () => {
    it('returns 401 without authentication', async () => {
      const response = await injectUnauthenticated(app, {
        method: 'GET',
        url: testApiPath('/app/branches/my'),
      });
      expect(response.statusCode).toBe(401);
    });

    it('gives a member only the active branches they work in', async () => {
      const { organization } = await adminContext();
      const staff = await memberWith([], organization);
      const assigned = await createTestBranch({ organizationId: organization.id, name: 'Vesu' });
      await createTestBranch({ organizationId: organization.id, name: 'Adajan', isMain: true });
      const inactive = await createTestBranch({
        organizationId: organization.id,
        name: 'Closed',
        isActive: false,
      });
      for (const branch of [assigned, inactive]) {
        await grantTestBranchUserAccess({
          branchId: branch.id,
          membershipId: staff.membership.id,
          organizationId: organization.id,
        });
      }

      const response = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath('/app/branches/my'),
        token: staff.token,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as BranchListBody;
      expect(body.data.map((branch) => branch.id)).toEqual([assigned.public_id]);
      expect(Object.keys(body.data[0]!).sort()).toEqual(
        ['closes_at', 'id', 'is_main', 'name', 'opens_at', 'tone', 'working_days'].sort(),
      );
    });

    it('gives a branch reader every active branch, main first', async () => {
      const { organization, token } = await adminContext();
      await createTestBranch({ organizationId: organization.id, name: 'Vesu' });
      const main = await createTestBranch({
        organizationId: organization.id,
        name: 'Adajan',
        isMain: true,
      });

      const response = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath('/app/branches/my'),
        token,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as BranchListBody;
      expect(body.data.map((branch) => branch.name)).toEqual(['Adajan', 'Vesu']);
      expect(body.data[0]!.id).toBe(main.public_id);
    });
  });

  describe('GET /app/branches', () => {
    it('returns 403 without branch:read', async () => {
      const { organization } = await adminContext();
      const staff = await memberWith([], organization);
      const response = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath('/app/branches'),
        token: staff.token,
      });
      expect(response.statusCode).toBe(403);
    });

    it('lists active branches, and inactive ones on request', async () => {
      const { organization, token } = await adminContext();
      await createTestBranch({ organizationId: organization.id, name: 'Adajan', isMain: true });
      await createTestBranch({ organizationId: organization.id, name: 'Old', isActive: false });

      const active = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath('/app/branches'),
        token,
      });
      const all = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath('/app/branches?include_inactive=true'),
        token,
      });

      expect(active.statusCode).toBe(200);
      expect((active.json() as BranchListBody).data.map((branch) => branch.name)).toEqual([
        'Adajan',
      ]);
      expect((all.json() as BranchListBody).data.map((branch) => branch.name)).toEqual([
        'Adajan',
        'Old',
      ]);
    });

    it('returns 400 for an unknown query value', async () => {
      const { token } = await adminContext();
      const response = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath('/app/branches?include_inactive=maybe'),
        token,
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /app/branches/{branch_id}', () => {
    it('returns the branch with its full details', async () => {
      const { organization, token } = await adminContext();
      const branch = await createTestBranch({ organizationId: organization.id, name: 'Adajan' });
      const response = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath(`/app/branches/${branch.public_id}`),
        token,
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as BranchBody;
      expect(body.data).toMatchObject({
        id: branch.public_id,
        name: 'Adajan',
        opens_at: '10:00',
        closes_at: '20:00',
        default_doctor_membership_id: null,
      });
      expect(body.data).not.toHaveProperty('organization_id');
    });

    it('returns 404 for an unknown branch', async () => {
      const { token } = await adminContext();
      const response = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath(`/app/branches/${UNKNOWN_BRANCH_ID}`),
        token,
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /app/branches', () => {
    it('creates a branch and gives its creator access', async () => {
      const { organization } = await adminContext();
      const creator = await memberWith([APP_PERMISSIONS.BRANCH_CREATE], organization);
      const token = creator.token;

      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath('/app/branches'),
        token,
        payload: {
          ...VALID_BRANCH,
          default_doctor_membership_id: creator.membership.public_id,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as BranchBody;
      expect(body.data).toMatchObject({
        name: 'Adajan',
        tone: 'sage',
        state: 'Gujarat',
        working_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
        default_doctor_membership_id: creator.membership.public_id,
      });
      expect(String(body.data.id)).toMatch(/^brn_[a-z0-9]{21}$/);

      const mine = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath('/app/branches/my'),
        token,
      });
      expect((mine.json() as BranchListBody).data.map((branch) => branch.id)).toEqual([
        body.data.id,
      ]);
    });

    it.each([
      ['a five-digit postal code', { postal_code: '39500' }],
      ['a phone without +91', { phone: '9825012345' }],
      ['closing before opening', { opens_at: '20:00', closes_at: '10:00' }],
      ['an unknown field', { colour: 'red' }],
    ])('returns 400 for %s', async (_case, change) => {
      const { token } = await adminContext();
      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath('/app/branches'),
        token,
        payload: { ...VALID_BRANCH, ...change },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for a default staff id that is no member here', async () => {
      const { token } = await adminContext();
      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath('/app/branches'),
        token,
        payload: { ...VALID_BRANCH, default_doctor_membership_id: 'mem_aaaaaaaaaaaaaaaaaaaaa' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 409 for a name already used here, ignoring case', async () => {
      const { organization, token } = await adminContext();
      await createTestBranch({ organizationId: organization.id, name: 'ADAJAN' });
      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath('/app/branches'),
        token,
        payload: VALID_BRANCH,
      });
      expect(response.statusCode).toBe(409);
    });

    it('returns 409 for a second main branch', async () => {
      const { organization, token } = await adminContext();
      await createTestBranch({ organizationId: organization.id, name: 'Vesu', isMain: true });
      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath('/app/branches'),
        token,
        payload: { ...VALID_BRANCH, is_main: true },
      });
      expect(response.statusCode).toBe(409);
    });

    it('returns 403 without branch:create', async () => {
      const { organization } = await adminContext();
      const reader = await memberWith([APP_PERMISSIONS.BRANCH_READ], organization);
      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath('/app/branches'),
        token: reader.token,
        payload: VALID_BRANCH,
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('PATCH /app/branches/{branch_id}', () => {
    it('changes the given fields and clears a nullable one', async () => {
      const { organization, token } = await adminContext();
      const branch = await createTestBranch({ organizationId: organization.id, name: 'Adajan' });
      const response = await injectAuthenticated(app, {
        method: 'PATCH',
        url: testApiPath(`/app/branches/${branch.public_id}`),
        token,
        payload: { name: 'Adajan West', gst_number: null, closes_at: '21:30' },
      });
      expect(response.statusCode).toBe(200);
      expect((response.json() as BranchBody).data).toMatchObject({
        name: 'Adajan West',
        gst_number: null,
        closes_at: '21:30',
      });
    });

    it('returns 400 when the stored opening time is not before the new closing time', async () => {
      const { organization, token } = await adminContext();
      const branch = await createTestBranch({ organizationId: organization.id });
      const response = await injectAuthenticated(app, {
        method: 'PATCH',
        url: testApiPath(`/app/branches/${branch.public_id}`),
        token,
        payload: { closes_at: '09:00' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for an empty body', async () => {
      const { organization, token } = await adminContext();
      const branch = await createTestBranch({ organizationId: organization.id });
      const response = await injectAuthenticated(app, {
        method: 'PATCH',
        url: testApiPath(`/app/branches/${branch.public_id}`),
        token,
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 409 when renamed to a name already used here', async () => {
      const { organization, token } = await adminContext();
      await createTestBranch({ organizationId: organization.id, name: 'Vesu' });
      const branch = await createTestBranch({ organizationId: organization.id, name: 'Adajan' });
      const response = await injectAuthenticated(app, {
        method: 'PATCH',
        url: testApiPath(`/app/branches/${branch.public_id}`),
        token,
        payload: { name: 'vesu' },
      });
      expect(response.statusCode).toBe(409);
    });

    it('returns 404 for an unknown branch', async () => {
      const { token } = await adminContext();
      const response = await injectAuthenticated(app, {
        method: 'PATCH',
        url: testApiPath(`/app/branches/${UNKNOWN_BRANCH_ID}`),
        token,
        payload: { name: 'Nowhere' },
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
