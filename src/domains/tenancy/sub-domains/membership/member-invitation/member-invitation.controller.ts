import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse } from '@/shared/utils/http/response.util.js';
import { ForbiddenError } from '@/shared/errors/index.js';
import {
  getRequestIdentifier,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import {
  buildAuditActorFields,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import type { MemberInvitationService } from './member-invitation.service.js';

/**
 * Builds the HTTP handler map for the invitation routes that remain after REQ-1: the organization-scoped
 * `revoke` / `resend` under `/organization/invitations/:invitation_id` and the invitee-facing
 * `/invitations/:invitation_id/accept`. Adding a member now issues the invitation via
 * `POST /organization/memberships`, so the standalone create/list, the invitee pending-list, and
 * decline routes were removed. Each handler records a scoped audit event — an acceptance in the
 * joined organization's log, since the invitee's token carries no organization yet.
 */
export function createMemberInvitationController(service: MemberInvitationService) {
  return {
    acceptMemberInvitation: async (request: FastifyRequest, _reply: FastifyReply) => {
      // sec-T4: route is `app.authenticate`-gated; the service binds the invitee email to the acting
      // user's email. API-key principals cannot accept invitations (no user identity to bind to).
      const auth = requirePrincipal(request);
      if (auth.kind !== 'user') {
        throw new ForbiddenError('errors:invitationEmailMismatch');
      }
      const { invitation_id: rawAcceptId } = (request.params as { invitation_id: string }) ?? {
        invitation_id: '',
      };
      // sec-new-T2: reject malformed path params before reaching the service layer.
      const invitationId = validatePublicIdParam({
        value: rawAcceptId ?? '',
        fieldName: 'invitation_id',
      });
      const data = await service.accept({
        invitation_public_id: invitationId,
        body: request.body,
        actingUserPublicId: auth.userId,
      });
      await recordScopedAuditEvent({
        request,
        input: {
          actorUserPublicId: auth.userId,
          action: 'tenancy.member_invitation.accept',
          resource_type: 'member_invitation',
          organizationPublicId: data.organization_id,
          metadata: {
            invitation_public_id: invitationId,
            membership_public_id: data.membership_id,
          },
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    revokeMemberInvitation: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      // sec-new-T2: reject malformed path params before reaching the service layer.
      const { invitation_id: rawRevokeId } = request.params as { invitation_id: string };
      const invitationId = validatePublicIdParam({
        value: rawRevokeId ?? '',
        fieldName: 'invitation_id',
      });
      await service.revoke({ scope, invitation_public_id: invitationId });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.member_invitation.revoke',
          resource_type: 'member_invitation',
          organizationPublicId: scope.organizationPublicId,
          metadata: { invitation_public_id: invitationId },
        },
      });
      return reply.code(204).send();
    },
    resendInvitation: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      // sec-new-T2: reject malformed path params before reaching the service layer.
      const { invitation_id: rawResendId } = request.params as { invitation_id: string };
      const invitationId = validatePublicIdParam({
        value: rawResendId ?? '',
        fieldName: 'invitation_id',
      });
      // R1 / TEN-34: regenerated token is delivered only via email, never returned.
      const invitation = await service.resend({
        scope,
        invitation_public_id: invitationId,
        body: request.body,
        options: {
          requestId: getRequestIdentifier(request),
        },
      });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.member_invitation.resend',
          resource_type: 'member_invitation',
          organizationPublicId: scope.organizationPublicId,
          metadata: { invitation_public_id: invitationId },
        },
      });
      return successResponse({ data: { invitation }, request_id: getRequestIdentifier(request) });
    },
  };
}
