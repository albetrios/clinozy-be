import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { runUserTombstoneRetentionJob } from '@/domains/user/workers/user-tombstone-retention.processor.js';
import { users } from '@/domains/user/user.schema.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { member_invitations } from '@/domains/tenancy/sub-domains/membership/member-invitation/member-invitation.schema.js';
import { verification_tokens } from '@/domains/auth/sub-domains/auth-method/verification-token/verification-token.schema.js';
import { uploads } from '@/domains/upload/upload.schema.js';
import {
  createMembership,
  createRoleWithPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import {
  MAINTENANCE_SCOPE,
  withMaintenanceDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { env } from '@/shared/config/env.config.js';
import { MILLISECONDS_PER_DAY } from '@/shared/constants/index.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { seedUploadForOrganization } from '@/tests/helpers/test-organization.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';

/**
 * A deleted account is hard-deleted after TOMBSTONE_RETENTION_DAYS. Every reference another row
 * keeps to it — who created a role, who invited a member, who uploaded an organization's file, a
 * verification token — used to block that purge for ever (the job skips a blocked row), keeping
 * the account's email, name and password hash.
 */
describe('user tombstone retention purges a deleted account other rows still reference', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('nulls the attribution, keeps the organization data, and deletes the account', async () => {
    const owner = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    const departed = await createTestUser();
    const operator = getOperatorDatabase();

    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [],
      createdByUserId: departed.id,
    });
    const invitee = await createTestUser();
    const membership = await createMembership({
      userId: invitee.id,
      organizationId: organization.id,
      roleId: role.id,
    });
    await operator
      .update(memberships)
      .set({ invited_by_user_id: departed.id })
      .where(eq(memberships.id, membership.id));
    await operator.insert(member_invitations).values({
      public_id: generatePublicId('memberInvitation'),
      membership_id: membership.id,
      email: invitee.email,
      token_hash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      invited_by_user_id: departed.id,
      expires_at: new Date(Date.now() + MILLISECONDS_PER_DAY),
    });
    const upload = await seedUploadForOrganization({
      userId: departed.id,
      organizationId: organization.id,
    });
    await operator.insert(verification_tokens).values({
      token_type: 'PASSWORD_RESET',
      token_hash: randomUUID().replaceAll('-', '').padEnd(64, '1'),
      user_id: departed.id,
      email: departed.email,
      expires_at: new Date(Date.now() + MILLISECONDS_PER_DAY),
    });
    await operator
      .update(users)
      .set({
        deleted_at: new Date(
          Date.now() - (env.TOMBSTONE_RETENTION_DAYS + 1) * MILLISECONDS_PER_DAY,
        ),
      })
      .where(eq(users.id, departed.id));

    const result = await withMaintenanceDatabaseContext({
      scope: MAINTENANCE_SCOPE.GLOBAL_RETENTION_CLEANUP,
      callback: (databaseHandle) => runUserTombstoneRetentionJob(databaseHandle),
    });

    expect(result.blockedCount).toBe(0);
    expect(await operator.select().from(users).where(eq(users.id, departed.id))).toEqual([]);
    const [keptRole] = await operator.select().from(roles).where(eq(roles.id, role.id));
    expect(keptRole?.created_by_user_id).toBeNull();
    const [keptMembership] = await operator
      .select()
      .from(memberships)
      .where(eq(memberships.id, membership.id));
    expect(keptMembership?.invited_by_user_id).toBeNull();
    const [keptInvitation] = await operator
      .select()
      .from(member_invitations)
      .where(eq(member_invitations.membership_id, membership.id));
    expect(keptInvitation?.invited_by_user_id).toBeNull();
    const [keptUpload] = await operator.select().from(uploads).where(eq(uploads.id, upload.id));
    expect(keptUpload?.user_id).toBeNull();
    expect(
      await operator
        .select()
        .from(verification_tokens)
        .where(eq(verification_tokens.user_id, departed.id)),
    ).toEqual([]);
  });
});
