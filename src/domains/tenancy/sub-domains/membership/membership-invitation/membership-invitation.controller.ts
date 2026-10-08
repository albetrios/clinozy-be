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
import type { MembershipInvitationService } from './membership-invitation.service.js';

/**
 * Builds the HTTP handler map for the invitation routes (launch §2.C): the invitee-facing
 * `/membership-invitations/:membership_invitation_id/accept` and the organization-scoped resend under
 * `/organization/memberships/:membership_id/invitation/resend`. Revoking lives on the membership
 * controller — it ends the invited membership too. Each handler records a scoped audit event — an
 * acceptance in the joined organization's log, since the invitee's token carries no organization yet.
 */
export function createMembershipInvitationController(service: MembershipInvitationService) {
  return {
    acceptMembershipInvitation: async (request: FastifyRequest, _reply: FastifyReply) => {
      // sec-T4: route is `app.authenticate`-gated; the service binds the invitee email to the acting
      // user's email. API-key principals cannot accept invitations (no user identity to bind to).
      const auth = requirePrincipal(request);
      if (auth.kind !== 'user') {
        throw new ForbiddenError('errors:invitationEmailMismatch');
      }
      const params = (request.params as { membership_invitation_id?: string }) ?? {};
      // sec-new-T2: reject malformed path params before reaching the service layer.
      const invitationId = validatePublicIdParam(
        params.membership_invitation_id ?? '',
        'membership_invitation_id',
      );
      const data = await service.accept(invitationId, request.body, auth.userId);
      await recordScopedAuditEvent(request, {
        actorUserPublicId: auth.userId,
        action: 'tenancy.membership_invitation.accept',
        resource_type: 'membership_invitation',
        organizationPublicId: data.organization_id,
        metadata: { invitation_public_id: invitationId, membership_public_id: data.membership_id },
      });
      return successResponse(data, getRequestIdentifier(request));
    },
    resendInvitation: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const params = (request.params as { membership_id?: string }) ?? {};
      // sec-new-T2: reject malformed path params before reaching the service layer.
      const membershipId = validatePublicIdParam(params.membership_id ?? '', 'membership_id');
      // R1 / TEN-34: regenerated token is delivered only via email, never returned.
      const invitation = await service.resendForMembership(scope, membershipId, request.body, {
        requestId: getRequestIdentifier(request),
      });
      await recordScopedAuditEvent(request, {
        ...buildAuditActorFields(auth),
        action: 'tenancy.membership_invitation.resend',
        resource_type: 'membership_invitation',
        organizationPublicId: scope.organizationPublicId,
        metadata: { invitation_public_id: invitation.id, membership_public_id: membershipId },
      });
      // T15: the invitation itself, not wrapped.
      return successResponse(invitation, getRequestIdentifier(request));
    },
  };
}
