import { describe, it, expect, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createMembershipInvitationController } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.controller.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { ValidationError } from '@/shared/errors/index.js';
import { attachPrincipalScope } from '@/tests/helpers/principal-scope.helper.js';

// sec-new-T2: path-param validation for the invitation routes (launch §2.C): the invitee's accept by
// `membership_invitation_id` and the organization's resend by `membership_id`. Revoking lives on the
// membership controller (it ends the invited membership too).
describe('createMembershipInvitationController — path-param validation (sec-new-T2)', () => {
  const organizationPublicId = generatePublicId('organization');
  const invitationPublicId = generatePublicId('membershipInvitation');
  const membershipPublicId = generatePublicId('membership');
  const invitation = {
    id: invitationPublicId,
    membership_id: membershipPublicId,
    organization_id: organizationPublicId,
    email: 'invite@example.com',
  };

  const service = {
    accept: vi.fn().mockResolvedValue(invitation),
    resendForMembership: vi.fn().mockResolvedValue(invitation),
  };

  const controller = createMembershipInvitationController(service as never);

  function mockUserRequest(params: Record<string, string>): FastifyRequest {
    return attachPrincipalScope({
      auth: {
        kind: 'user',
        userId: generatePublicId('user'),
        role: 'USER',
        organizationPublicId,
      },
      params,
      body: {},
      query: {},
      headers: {},
      id: 'req-id',
    }) as unknown as FastifyRequest;
  }

  function mockReply(): FastifyReply {
    return {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
  }

  it('acceptMembershipInvitation rejects a malformed membership_invitation_id (sec-new-T2)', async () => {
    await expect(
      controller.acceptMembershipInvitation(
        mockUserRequest({ membership_invitation_id: 'not-a-public-id!!' }),
        mockReply(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(service.accept).not.toHaveBeenCalled();
  });

  it('acceptMembershipInvitation accepts a valid id and calls service.accept (sec-new-T2)', async () => {
    await controller.acceptMembershipInvitation(
      mockUserRequest({ membership_invitation_id: invitationPublicId }),
      mockReply(),
    );
    expect(service.accept).toHaveBeenCalledWith(
      invitationPublicId,
      expect.anything(),
      expect.any(String),
    );
  });

  it('resendInvitation rejects a malformed membership_id (sec-new-T2)', async () => {
    await expect(
      controller.resendInvitation(mockUserRequest({ membership_id: 'mem_bad id' }), mockReply()),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(service.resendForMembership).not.toHaveBeenCalled();
  });

  it('resendInvitation accepts a valid membership_id and calls service.resendForMembership (sec-new-T2)', async () => {
    await controller.resendInvitation(
      mockUserRequest({ membership_id: membershipPublicId }),
      mockReply(),
    );
    expect(service.resendForMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationPublicId: organizationPublicId }),
      membershipPublicId,
      expect.anything(),
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });
});
