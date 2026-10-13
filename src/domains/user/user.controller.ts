import type { FastifyReply, FastifyRequest } from 'fastify';
import { successResponse, paginatedResponse } from '@/shared/utils/http/response.util.js';
import {
  getRequestIdentifier,
  requireAuth,
  requireUserScope,
} from '@/shared/utils/http/request.util.js';
import { validatePublicIdParam } from '@/shared/utils/identity/public-id-param.util.js';
import {
  listBodyFieldNames,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { MembershipInvitationService } from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.service.js';
import type { UserSettingsOutput } from '@/domains/user/sub-domains/user-settings/user-settings.types.js';
import type { UserContainer } from './user.container.js';

type AdminUserAuditAction =
  | 'user.admin.update'
  | 'user.admin.delete'
  | 'user.admin.suspend'
  | 'user.admin.unsuspend';

function getUserIdParam(request: FastifyRequest): string {
  return validatePublicIdParam({
    value: (request.params as { user_id: string }).user_id ?? '',
    fieldName: 'user_id',
  });
}

async function recordAdminUserAudit({
  request,
  actorUserPublicId,
  action,
  targetUserPublicId,
  severity,
}: {
  request: FastifyRequest;
  actorUserPublicId: string;
  action: AdminUserAuditAction;
  targetUserPublicId: string;
  severity?: 'WARNING' | undefined;
}): Promise<void> {
  await recordScopedAuditEvent({
    request,
    input: {
      actorUserPublicId,
      action,
      resource_type: 'user',
      ...(severity ? { severity } : {}),
      metadata: { target_user_public_id: targetUserPublicId },
    },
  });
}

/**
 * Keeps an analytics consent receipt — an answer given while signed in — as its own audit row: the
 * decision, the policy version it answered and when, the proof of consent (launch D85,
 * change-cookie-consent CC2). Nothing when the body carried no decision.
 */
async function recordAnalyticsConsentAudit({
  request,
  actorUserPublicId,
  settings,
}: {
  request: FastifyRequest;
  actorUserPublicId: string;
  settings: UserSettingsOutput;
}): Promise<void> {
  if (!listBodyFieldNames(request.body).includes('analytics_consent')) return;
  await recordScopedAuditEvent({
    request,
    input: {
      actorUserPublicId,
      action: 'user.settings.analytics_consent.update',
      resource_type: 'user_settings',
      metadata: {
        analytics_consent: settings.analytics_consent,
        analytics_consent_version: settings.analytics_consent_version,
        analytics_consent_at: settings.analytics_consent_at,
      },
    },
  });
}

/** The admin handlers (list/get/update/suspend/unsuspend/delete), each audited via {@link recordAdminUserAudit}. */
function createUserAdminHandlers({ userService }: Pick<UserContainer, 'userService'>) {
  return {
    listUsers: async (request: FastifyRequest, _reply: FastifyReply) => {
      const result = await userService.listUsers(request.query);
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

    getUser: async (request: FastifyRequest, _reply: FastifyReply) => {
      const userId = getUserIdParam(request);
      const data = await userService.getUser(userId);
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },

    updateUser: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requireAuth(request);
      const userId = getUserIdParam(request);
      const data = await userService.adminUpdateUser({ publicId: userId, body: request.body });
      // sec-U9: every admin user-management action emits an audit row so a rogue
      // admin cannot wipe accounts without leaving a platform-visible trace.
      await recordAdminUserAudit({
        request,
        actorUserPublicId: auth.userId,
        action: 'user.admin.update',
        targetUserPublicId: userId,
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },

    deleteUser: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request);
      const userId = getUserIdParam(request);
      await userService.deleteUser(userId);
      await recordAdminUserAudit({
        request,
        actorUserPublicId: auth.userId,
        action: 'user.admin.delete',
        targetUserPublicId: userId,
        severity: 'WARNING',
      });
      return reply.status(204).send();
    },

    suspendUser: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requireAuth(request);
      const userId = getUserIdParam(request);
      const data = await userService.suspendUser(userId);
      await recordAdminUserAudit({
        request,
        actorUserPublicId: auth.userId,
        action: 'user.admin.suspend',
        targetUserPublicId: userId,
        severity: 'WARNING',
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },

    unsuspendUser: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requireAuth(request);
      const userId = getUserIdParam(request);
      const data = await userService.unsuspendUser(userId);
      await recordAdminUserAudit({
        request,
        actorUserPublicId: auth.userId,
        action: 'user.admin.unsuspend',
        targetUserPublicId: userId,
        severity: 'WARNING',
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },
  };
}

/**
 * Build the user-domain HTTP handler map covering self-service profile, settings, notification
 * preferences, avatar upload/delete, and admin list/get/update/suspend/unsuspend/delete. Settings
 * mutations also emit a scoped audit event (`user.settings.update`) via the request audit context.
 */
export function createUserController({
  userService,
  userSettingsService,
  userNotificationPreferencesService,
  organizationService,
  membershipInvitationService,
}: Pick<
  UserContainer,
  'userService' | 'userSettingsService' | 'userNotificationPreferencesService'
> & {
  organizationService?: OrganizationService;
  membershipInvitationService?: MembershipInvitationService;
}) {
  return {
    // ── Self-service ──────────────────────────────────────────

    /**
     * `GET /users/me/organizations` — the organizations the caller belongs to.
     *
     * The data is tenancy's; the caller's scope decides where the route lives: `/users/me/...` is
     * this API's home for "mine", as the collection root is for the admin view (`GET /users`). The
     * mirror image of `/tenancy/organization/audit-logs`, scoped by the active organization.
     */
    listMyOrganizations: async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!organizationService) throw new Error('Organization service not configured');
      const result = await organizationService.listForUser({
        query: request.query,
        user_public_id: requireAuth(request).userId,
      });
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

    /**
     * `GET /users/me/membership-invitations` — the caller's pending invitations (launch D84 (1)):
     * tenancy's data in the caller's scope, like `listMyOrganizations`. Never counts.
     */
    listMyMembershipInvitations: async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!membershipInvitationService) {
        throw new Error('Membership invitation service not configured');
      }
      const auth = requireAuth(request);
      const result = await membershipInvitationService.listMine({
        query: request.query,
        actingUserPublicId: auth.userId,
      });
      return paginatedResponse({
        data: result.items,
        request_id: getRequestIdentifier(request),
        pagination: {
          per_page: result.limit,
          next: result.next_cursor,
          has_more: result.has_more,
        },
      });
    },

    getMe: async (request: FastifyRequest, _reply: FastifyReply) => {
      const _auth = requireAuth(request);
      const data = await userService.getMe(requireUserScope(request));
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },

    patchMe: async (request: FastifyRequest, _reply: FastifyReply) => {
      const _auth = requireAuth(request);
      const scope = requireUserScope(request);
      const data = await userService.updateMe({ scope, body: request.body });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },

    // requireUserScope is the auth check here: it throws the same 401 requireAuth would.
    putMyPresence: async (request: FastifyRequest, _reply: FastifyReply) => {
      const data = await userService.updateMyPresence({
        scope: requireUserScope(request),
        body: request.body,
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },

    completeOnboardingMe: async (request: FastifyRequest, _reply: FastifyReply) => {
      const _auth = requireAuth(request);
      const data = await userService.completeOnboarding(requireUserScope(request));
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },

    deleteMe: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request);
      await userService.deleteMe(auth.userId);
      // sec-U9: self-initiated offboarding is audited at WARNING, apart from an admin delete.
      await recordScopedAuditEvent({
        request,
        input: {
          actorUserPublicId: auth.userId,
          action: 'user.self.delete',
          resource_type: 'user',
          severity: 'WARNING',
        },
      });
      return reply.status(204).send();
    },

    getSettings: async (request: FastifyRequest, _reply: FastifyReply) => {
      const _auth = requireAuth(request);
      const data = await userSettingsService.get(requireUserScope(request));
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },

    patchSettings: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requireAuth(request);
      const scope = requireUserScope(request);
      const data = await userSettingsService.update({ scope, body: request.body });
      await recordScopedAuditEvent({
        request,
        input: {
          actorUserPublicId: auth.userId,
          action: 'user.settings.update',
          resource_type: 'user_settings',
        },
      });
      await recordAnalyticsConsentAudit({
        request,
        actorUserPublicId: auth.userId,
        settings: data,
      });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },

    getNotificationPreferences: async (request: FastifyRequest, _reply: FastifyReply) => {
      const _auth = requireAuth(request);
      const data = await userNotificationPreferencesService.get(requireUserScope(request));
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },

    putNotificationPreferences: async (request: FastifyRequest, _reply: FastifyReply) => {
      const _auth = requireAuth(request);
      const scope = requireUserScope(request);
      const data = await userNotificationPreferencesService.put({ scope, body: request.body });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },

    uploadAvatar: async (request: FastifyRequest, _reply: FastifyReply) => {
      const auth = requireAuth(request);
      const data = await userService.uploadAvatar({ publicId: auth.userId, body: request.body });
      return successResponse({ data, request_id: getRequestIdentifier(request) });
    },

    deleteAvatar: async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = requireAuth(request);
      await userService.deleteAvatar(auth.userId);
      return reply.code(204).send();
    },

    ...createUserAdminHandlers({ userService }),
  };
}
