import type { FastifyReply, FastifyRequest } from 'fastify';
import { paginatedResponse, successResponse } from '@/shared/utils/http/response.util.js';
import {
  getActingUserPublicId,
  getRequestIdentifier,
  isApiKeyPrincipal,
  requireAuth,
  requireOrganizationScope,
  requirePrincipal,
} from '@/shared/utils/http/request.util.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import {
  buildAuditActorFields,
  listBodyFieldNames,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import type { AuthContext } from '@/shared/types/index.js';
import type { MembershipService } from './membership.service.js';
import type { MembershipActionOptions } from './membership.types.js';

/**
 * The `membership_id` path param, validated at the boundary (sec-re-18, sec-B10 class): an
 * attacker-supplied string never flows into Sentry breadcrumbs, log payloads, or metric labels with
 * unbounded cardinality.
 */
function readMembershipIdParam(request: FastifyRequest): string {
  const rawParams = (request.params as { membership_id?: string }) ?? {};
  return validatePublicIdParam({
    value: rawParams.membership_id ?? '',
    fieldName: 'membership_id',
  });
}

/** The read handlers: list, get, and a membership's resolved permissions. */
function createMembershipReadHandlers(service: MembershipService) {
  return {
    listMemberships: async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const result = await service.list({ scope, query: request.query });
      return paginatedResponse({
        data: result.items,
        request_id: getRequestIdentifier(request),
        pagination: {
          per_page: result.limit,
          next: result.next_cursor,
          has_more: result.has_more,
          ...(result.total !== null ? { estimated_total: result.total } : {}),
        },
      });
    },
    getMembership: async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const membershipId = readMembershipIdParam(request);
      const data = await service.getByPublicId({ scope, membership_public_id: membershipId });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    getMembershipPermissions: async (request: FastifyRequest, _reply: FastifyReply) => {
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const membershipId = readMembershipIdParam(request);
      const data = await service.getPermissions({ scope, membership_public_id: membershipId });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
  };
}

/** The write handlers — each records a scoped audit event in the organization's log. */
function createMembershipWriteHandlers(service: MembershipService) {
  return {
    createMembership: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      // REQ-1: "Add member" — the raw invitation token is delivered ONLY via email, never returned
      // (bar the dev-only `invitation.debug_invitation_token` echo, ROUTE #164); the response
      // carries the created INVITED membership (with its embedded invitation ref).
      const data = await service.create({
        scope,
        body: request.body,
        invited_by_user_public_id: getActingUserPublicId(auth),
        options: {
          requestId: getRequestIdentifier(request),
        },
      });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.membership.create',
          resource_type: 'membership',
          organizationPublicId: scope.organizationPublicId,
          target_user_public_id: data.user_id,
          metadata: {
            membership_public_id: data.id,
            role_public_ids: data.role_ids,
            invitation_public_id: data.invitation?.id ?? null,
          },
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    updateMembership: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const membershipId = readMembershipIdParam(request);
      const data = await service.update({
        scope,
        membership_public_id: membershipId,
        body: request.body,
        updated_by_user_public_id: getActingUserPublicId(auth),
        options: membershipActionOptions(auth),
      });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.membership.update',
          resource_type: 'membership',
          organizationPublicId: scope.organizationPublicId,
          target_user_public_id: data.user_id,
          metadata: {
            membership_public_id: membershipId,
            role_public_ids: data.role_ids,
            changed_fields: listBodyFieldNames(request.body),
          },
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
    deleteMembership: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const membershipId = readMembershipIdParam(request);
      await service.delete({
        scope,
        membership_public_id: membershipId,
        query: request.query,
        options: membershipActionOptions(auth),
      });
      const removal = request.query as { reason?: string };
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.membership.delete',
          resource_type: 'membership',
          organizationPublicId: scope.organizationPublicId,
          metadata: { membership_public_id: membershipId, delete_reason: removal.reason },
        },
      });
      return reply.code(204).send();
    },
    revokeInvitation: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const membershipId = readMembershipIdParam(request);
      await service.revokeInvitation({
        scope,
        membership_public_id: membershipId,
        options: membershipActionOptions(auth),
      });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.membership_invitation.revoke',
          resource_type: 'membership_invitation',
          organizationPublicId: scope.organizationPublicId,
          metadata: { membership_public_id: membershipId },
        },
      });
      return reply.code(204).send();
    },
    restoreMembership: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requirePrincipal(request);
      const scope = requireOrganizationScope(request);
      const membershipId = readMembershipIdParam(request);
      const data = await service.restore({
        scope,
        membership_public_id: membershipId,
        restored_by_user_public_id: getActingUserPublicId(auth),
        options: membershipActionOptions(auth),
      });
      await recordScopedAuditEvent({
        request,
        input: {
          ...buildAuditActorFields(auth),
          action: 'tenancy.membership.restore',
          resource_type: 'membership',
          organizationPublicId: scope.organizationPublicId,
          target_user_public_id: data.user_id,
          metadata: { membership_public_id: membershipId },
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
  };
}

/** The member's own actions: leave the organization, hand the ownership over. */
function createMembershipSelfServiceHandlers(service: MembershipService) {
  return {
    leaveOrganization: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request);
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      await service.leaveOrganization({ scope, user_public_id: auth.userId });
      await recordScopedAuditEvent({
        request,
        input: {
          actorUserPublicId: auth.userId,
          action: 'tenancy.membership.leave',
          resource_type: 'membership',
          organizationPublicId: scope.organizationPublicId,
        },
      });
      return reply.code(204).send();
    },
    transferOwnership: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requireAuth(request);
      const scope = requireOrganizationScope(request);
      const _organizationId = scope.organizationPublicId;
      const data = await service.transferOwnership({
        scope,
        body: request.body,
        current_user_public_id: auth.userId,
      });
      await recordScopedAuditEvent({
        request,
        input: {
          actorUserPublicId: auth.userId,
          action: 'tenancy.membership.transfer_ownership',
          resource_type: 'organization',
          organizationPublicId: scope.organizationPublicId,
          target_user_public_id: data.user_id,
          severity: 'WARNING',
          metadata: { membership_public_id: data.id },
        },
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
  };
}

/** An API key's scopes stand in for its held permissions in the membership role-ordering check. */
function membershipActionOptions(auth: AuthContext): MembershipActionOptions {
  return isApiKeyPrincipal(auth) ? { callerApiKeyScopes: auth.apiKeyScopes } : {};
}

/**
 * Builds the HTTP handler map for the active-organization membership routes
 * under `/organization/memberships` plus the self-service `leave` and
 * `transfer-ownership` actions. The active organization is resolved from the
 * signed JWT `org` claim via `requireOrganizationScope`. Every mutating handler records a scoped
 * audit event in the organization's log.
 */
export function createMembershipController(service: MembershipService) {
  return {
    ...createMembershipReadHandlers(service),
    ...createMembershipWriteHandlers(service),
    ...createMembershipSelfServiceHandlers(service),
  };
}
