import { describe, it, expect, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import {
  createMembership,
  seedAllPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { MEMBERSHIP_DELETE_REASON } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import {
  provisionOrganizationWithOwner,
  provisionPersonalOrganization,
} from '@/domains/tenancy/sub-domains/organization/organization-provisioning.js';
import {
  findUserActiveOrganizationPublicId,
  findUserActiveOrganizationPublicIdByInternalId,
  resolveDefaultActiveOrganizationPublicId,
} from '@/domains/tenancy/sub-domains/organization/resolve-active-organization.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

/**
 * The membership lookups behind `switch-to-organization`, refresh and the login default, against
 * the real queries: a removed membership (its row keeps `status = active`, B2-4) never counts, and
 * a suspended organization is reachable for its owner alone (B2-3).
 */
describe('Organization membership lookups — live memberships, usable organizations (database)', () => {
  beforeEach(async () => {
    await cleanupDatabase();
    await seedAllPermissions();
  });

  async function clinicWithMember() {
    const owner = await createTestUser();
    const { organization, roleId } = await provisionOrganizationWithOwner({
      name: 'Lookup Clinic',
      slug: `lookup-${generatePublicId('organization').slice(4, 14)}`,
      type: 'TEAM',
      ownerUserId: owner.id,
    });
    const member = await createTestUser();
    await provisionPersonalOrganization({ ownerUserId: member.id });
    await createMembership({ userId: member.id, organizationId: organization.id, roleId });
    return { owner, member, organization };
  }

  async function removeMembership(options: { userId: number; organizationId: number }) {
    await getOperatorDatabase()
      .update(memberships)
      .set({ deleted_at: new Date(), delete_reason: MEMBERSHIP_DELETE_REASON.NOT_NEEDED })
      .where(
        and(
          eq(memberships.user_id, options.userId),
          eq(memberships.organization_id, options.organizationId),
        ),
      );
  }

  async function setOrganizationStatus(organizationId: number, status: string) {
    await getOperatorDatabase()
      .update(organizations)
      .set({ status })
      .where(eq(organizations.id, organizationId));
  }

  it('finds a live membership for switch, refresh and the login default', async () => {
    const { member, organization } = await clinicWithMember();
    expect(
      await findUserActiveOrganizationPublicId({
        userInternalId: member.id,
        organizationPublicId: organization.public_id,
      }),
    ).toBe(organization.public_id);
    expect(
      await findUserActiveOrganizationPublicIdByInternalId({
        userInternalId: member.id,
        organizationInternalId: organization.id,
      }),
    ).toBe(organization.public_id);
    expect(await resolveDefaultActiveOrganizationPublicId(member.id)).toBe(organization.public_id);
  });

  it('never counts a removed membership — switch, refresh and the login default all skip it (B2-4)', async () => {
    const { member, organization } = await clinicWithMember();
    await removeMembership({ userId: member.id, organizationId: organization.id });

    expect(
      await findUserActiveOrganizationPublicId({
        userInternalId: member.id,
        organizationPublicId: organization.public_id,
      }),
    ).toBeUndefined();
    expect(
      await findUserActiveOrganizationPublicIdByInternalId({
        userInternalId: member.id,
        organizationInternalId: organization.id,
      }),
    ).toBeUndefined();
    expect(await resolveDefaultActiveOrganizationPublicId(member.id)).not.toBe(
      organization.public_id,
    );
  });

  it('lets only the owner switch into, or keep, a suspended organization (B2-3)', async () => {
    const { owner, member, organization } = await clinicWithMember();
    await setOrganizationStatus(organization.id, 'SUSPENDED');

    expect(
      await findUserActiveOrganizationPublicId({
        userInternalId: member.id,
        organizationPublicId: organization.public_id,
      }),
    ).toBeUndefined();
    expect(
      await findUserActiveOrganizationPublicIdByInternalId({
        userInternalId: member.id,
        organizationInternalId: organization.id,
      }),
    ).toBeUndefined();
    expect(
      await findUserActiveOrganizationPublicId({
        userInternalId: owner.id,
        organizationPublicId: organization.public_id,
      }),
    ).toBe(organization.public_id);
    expect(
      await findUserActiveOrganizationPublicIdByInternalId({
        userInternalId: owner.id,
        organizationInternalId: organization.id,
      }),
    ).toBe(organization.public_id);
    // Not opened by default at login, even for the owner — they switch in on purpose.
    expect(await resolveDefaultActiveOrganizationPublicId(owner.id)).not.toBe(
      organization.public_id,
    );
  });
});
