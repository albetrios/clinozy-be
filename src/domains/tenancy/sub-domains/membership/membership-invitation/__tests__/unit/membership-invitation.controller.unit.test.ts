import { describe, it, expect, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createMembershipInvitationController } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.controller.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { ValidationError } from '@/shared/errors/index.js';
import { attachPrincipalScope } from '@/tests/helpers/principal-scope.helper.js';

// sec-new-T2: invitationId path-param validation for the remaining invitation routes
// (accept / revoke / resend). Add-member issues invitations via POST /memberships (REQ-1), so the
// standalone create/list, invitee pending-list, and decline routes no longer exist on this controller.
describe('createMembershipInvitationController — invitationId path-param validation (sec-new-T2)', () => {
  const organizationPublicId = generatePublicId('organization');
  const invitationPublicId = generatePublicId('membershipInvitation');
  const invitation = { id: invitationPublicId, email: 'invite@example.com' };

  const service = {
    accept: vi.fn().mockResolvedValue(invitation),
    revoke: vi.fn().mockResolvedValue(undefined),
    resend: vi.fn().mockResolvedValue(invitation),
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

  it('acceptMembershipInvitation rejects a malformed invitationId (sec-new-T2)', async () => {
    await expect(
      controller.acceptMembershipInvitation(
        mockUserRequest({ invitation_id: 'not-a-public-id!!' }),
        mockReply(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(service.accept).not.toHaveBeenCalled();
  });

  it('acceptMembershipInvitation accepts a valid invitationId and calls service.accept (sec-new-T2)', async () => {
    await controller.acceptMembershipInvitation(
      mockUserRequest({ invitation_id: invitationPublicId }),
      mockReply(),
    );
    expect(service.accept).toHaveBeenCalledWith(
      invitationPublicId,
      expect.anything(),
      expect.any(String),
    );
  });

  it('revokeMembershipInvitation rejects a malformed invitationId (sec-new-T2)', async () => {
    await expect(
      controller.revokeMembershipInvitation(
        mockUserRequest({
          organization_id: organizationPublicId,
          invitation_id: '../../etc/passwd',
        }),
        mockReply(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(service.revoke).not.toHaveBeenCalled();
  });

  it('revokeMembershipInvitation accepts a valid invitationId and calls service.revoke (sec-new-T2)', async () => {
    await controller.revokeMembershipInvitation(
      mockUserRequest({ organization_id: organizationPublicId, invitation_id: invitationPublicId }),
      mockReply(),
    );
    expect(service.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ organizationPublicId: organizationPublicId }),
      invitationPublicId,
    );
  });

  it('resendInvitation rejects a malformed invitationId (sec-new-T2)', async () => {
    await expect(
      controller.resendInvitation(
        mockUserRequest({ organization_id: organizationPublicId, invitation_id: 'inv_bad id' }),
        mockReply(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(service.resend).not.toHaveBeenCalled();
  });

  it('resendInvitation accepts a valid invitationId and calls service.resend (sec-new-T2)', async () => {
    await controller.resendInvitation(
      mockUserRequest({ organization_id: organizationPublicId, invitation_id: invitationPublicId }),
      mockReply(),
    );
    expect(service.resend).toHaveBeenCalledWith(
      expect.objectContaining({ organizationPublicId: organizationPublicId }),
      invitationPublicId,
      expect.anything(),
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });
});
