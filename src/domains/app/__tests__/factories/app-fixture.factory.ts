import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { provisionOrganizationWithOwner } from '@/domains/tenancy/sub-domains/organization/organization-provisioning.js';
import {
  createMembership,
  seedAllPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { grantTestBranchMember } from '@/tests/factories/branches.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';

/** The people of the app fixture: the owner and one member per clinic preset role (launch D5). */
export const APP_FIXTURE_ROLES = [
  'owner',
  'admin',
  'doctor',
  'therapist',
  'front_desk',
  'counsellor',
  'pharmacist',
  'accountant',
  'marketing',
] as const;

/** One person of {@link APP_FIXTURE_ROLES}. */
export type AppFixtureRole = (typeof APP_FIXTURE_ROLES)[number];

/** The preset role each fixture member holds, by its seeded name. */
const ROLE_NAMES: Record<Exclude<AppFixtureRole, 'owner'>, string> = {
  admin: 'Admin',
  doctor: 'Doctor',
  therapist: 'Therapist',
  front_desk: 'Front desk',
  counsellor: 'Counsellor',
  pharmacist: 'Pharmacist',
  accountant: 'Accountant',
  marketing: 'Marketing',
};

/** A fixture member: their login, their membership and a token in the fixture organization. */
export interface AppFixtureMember {
  userId: number;
  userPublicId: string;
  email: string;
  membershipId: number;
  membershipPublicId: string;
  token: string;
}

/** What {@link createAppFixture} builds. */
export interface AppFixture {
  organization: { id: number; publicId: string; timezone: string };
  /** The two branches' public ids. */
  branches: { vesu: string; adajan: string };
  /** The two branches' internal ids. */
  branchIds: { vesu: number; adajan: number };
  /** Each preset role's public id, keyed like {@link APP_FIXTURE_ROLES} (`owner` included). */
  roles: Record<AppFixtureRole, string>;
  members: Record<AppFixtureRole, AppFixtureMember>;
}

/** A branch body the create route accepts. */
function branchBody(name: string, stamp: string) {
  return {
    name,
    address_line_one: '12 Ring Road',
    area: name,
    city: 'Surat',
    postal_code: '395007',
    phone: '+919876543210',
    email: `${name.toLowerCase()}.${stamp}@fixture.example`,
  };
}

/**
 * The app suites' fixture: a TEAM organization
 * provisioned the way signup does (owner + the clinic preset roles), two branches made through the
 * API (Vesu, Adajan), and one live member per preset role working at Vesu, each with a token.
 *
 * @remarks
 * - **Algorithm:** seeds the permission catalog, provisions the organization, creates the branches
 *   as the owner, then inserts each member (`active`, joined now) with their role and Vesu.
 * - **Failure modes:** throws when a branch create does not answer 200.
 * - **Notes:** call after `cleanupDatabase()`; members are inserted directly (no invitation), the
 *   way the live fixture made them live in the database.
 */
export async function createAppFixture(app: FastifyInstance): Promise<AppFixture> {
  await seedAllPermissions();
  const stamp = randomUUID().slice(0, 8);
  const owner = await createTestUser({
    email: `owner.${stamp}@fixture.example`,
    firstName: 'Owner',
    lastName: 'Fixture',
    isEmailVerified: true,
  });
  const provisioned = await provisionOrganizationWithOwner({
    name: `Fixture clinic ${stamp}`,
    slug: `fixture-${stamp}`,
    type: 'TEAM',
    ownerUserId: owner.id,
  });
  const organization = provisioned.organization;
  const ownerToken = await generateTestToken({
    userId: owner.public_id,
    organizationPublicId: organization.public_id,
  });

  const branchPublicIds: string[] = [];
  for (const name of ['Vesu', 'Adajan']) {
    const response = await injectAuthenticated(app, {
      method: 'POST',
      url: testApiPath('/app/branches'),
      token: ownerToken,
      headers: { 'x-idempotency-key': `fixture-${randomUUID()}` },
      payload: branchBody(name, stamp),
    });
    if (response.statusCode !== 200) {
      throw new Error(`createAppFixture: branch ${name} → ${response.statusCode} ${response.body}`);
    }
    branchPublicIds.push((response.json() as { data: { id: string } }).data.id);
  }
  const [vesuPublicId, adajanPublicId] = branchPublicIds as [string, string];

  const operatorSql = getOperatorSql();
  const branchRows = await operatorSql<{ id: number; public_id: string }[]>`
    SELECT id, public_id FROM app.branches WHERE organization_id = ${organization.id}
  `;
  const branchIdOf = (publicId: string) =>
    Number(branchRows.find((row) => row.public_id === publicId)?.id);
  const roleRows = await operatorSql<{ id: number; public_id: string; name: string }[]>`
    SELECT id, public_id, name FROM tenancy.roles WHERE organization_id = ${organization.id}
  `;
  const roleRowNamed = (name: string) => {
    const row = roleRows.find((candidate) => candidate.name === name);
    if (!row) throw new Error(`createAppFixture: no preset role ${name}`);
    return row;
  };
  const [ownerMembership] = await operatorSql<{ id: number; public_id: string }[]>`
    SELECT id, public_id FROM tenancy.memberships
    WHERE organization_id = ${organization.id} AND user_id = ${owner.id}
  `;

  const members = {
    owner: {
      userId: owner.id,
      userPublicId: owner.public_id,
      email: owner.email,
      membershipId: Number(ownerMembership!.id),
      membershipPublicId: ownerMembership!.public_id,
      token: ownerToken,
    },
  } as Record<AppFixtureRole, AppFixtureMember>;
  const roles = { owner: roleRowNamed('Owner').public_id } as Record<AppFixtureRole, string>;

  for (const [key, roleName] of Object.entries(ROLE_NAMES) as [
    Exclude<AppFixtureRole, 'owner'>,
    string,
  ][]) {
    const role = roleRowNamed(roleName);
    roles[key] = role.public_id;
    const user = await createTestUser({
      email: `${key.replaceAll('_', '-')}.${stamp}@fixture.example`,
      firstName: roleName,
      lastName: 'Fixture',
      isEmailVerified: true,
    });
    const membership = await createMembership({
      userId: user.id,
      organizationId: organization.id,
      roleId: Number(role.id),
    });
    await grantTestBranchMember({
      branchId: branchIdOf(vesuPublicId),
      membershipId: membership.id,
      organizationId: organization.id,
    });
    members[key] = {
      userId: user.id,
      userPublicId: user.public_id,
      email: user.email,
      membershipId: membership.id,
      membershipPublicId: membership.public_id,
      token: await generateTestToken({
        userId: user.public_id,
        organizationPublicId: organization.public_id,
      }),
    };
  }

  return {
    organization: {
      id: organization.id,
      publicId: organization.public_id,
      timezone: organization.timezone,
    },
    branches: { vesu: vesuPublicId, adajan: adajanPublicId },
    branchIds: { vesu: branchIdOf(vesuPublicId), adajan: branchIdOf(adajanPublicId) },
    roles,
    members,
  };
}
