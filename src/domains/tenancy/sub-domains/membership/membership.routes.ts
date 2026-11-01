import type { FastifyPluginAsync } from 'fastify';
import { requireRecentStepUpPreHandler } from '@/shared/middlewares/core/recent-step-up.middleware.js';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  EXPENSIVE_AUTHED_RATE_LIMIT,
  MODERATE_AUTHED_RATE_LIMIT,
  ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
  STRICT_AUTHED_RATE_LIMIT,
  STRICT_PUBLIC_RATE_LIMIT,
} from '@/shared/middlewares/rate-limit/rate-limit-presets.constants.js';
import type { MembershipService } from './membership.service.js';
import type { MembershipInvitationService } from './membership-invitation/membership-invitation.service.js';
import {
  acceptMembershipInvitationDto,
  membershipInvitationIdParamsDto,
  resendMembershipInvitationDto,
} from './membership-invitation/membership-invitation.dto.js';
import {
  createMembershipDto,
  deleteMembershipQueryDto,
  membershipIdParamsDto,
  transferOwnershipDto,
  updateMembershipDto,
} from './membership.dto.js';
import { createMembershipController } from './membership.controller.js';
import { createMembershipInvitationController } from './membership-invitation/membership-invitation.controller.js';
import { requireOrganizationPermission } from '@/shared/utils/auth/authorization.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';

/** Services required to wire the membership and membership-invitation routes. */
export interface MembershipRoutesDeps {
  membershipService: MembershipService;
  membershipInvitationService: MembershipInvitationService;
}

/**
 * Fastify plugin that registers the team's routes (launch §2.B, §2.C): the active organization's
 * memberships (list, get, add, change, remove, restore, effective codes), the invited member's
 * invite (revoke, resend — nested under the membership, T9), self-service leave /
 * transfer-ownership, and the invitee-facing `/membership-invitations/:membership_invitation_id/accept`
 * and `…/decline` (launch D84). One code set gates them (T8): `membership:read|create|update|delete`;
 * accepting and declining need only the signed-in owner of the invited, verified email; every
 * `POST` takes `X-Idempotency-Key` (T13).
 */
export function membershipRoutes(deps: MembershipRoutesDeps): FastifyPluginAsync {
  const membershipController = createMembershipController(deps.membershipService);
  const invitationController = createMembershipInvitationController({
    service: deps.membershipInvitationService,
    membershipService: deps.membershipService,
  });

  return async (app) => {
    const zodApplication = app.withTypeProvider<ZodTypeProvider>();
    zodApplication.get(
      '/organization/memberships',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.MEMBERSHIP_READ)],
        schema: {
          summary: 'List memberships',
          description:
            'The team list — every status, with roles, branches and the pending invite. Filters: q (name or email), status, role_id (main or extra role), branch_id; include_ended=true adds ended members. Sort by created_at (default) or name. Requires membership:read.',
          tags: ['Membership'],
        },
      },
      membershipController.listMemberships,
    );
    zodApplication.get<{ Params: { membership_id: string } }>(
      '/organization/memberships/:membership_id',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.MEMBERSHIP_READ)],
        schema: {
          summary: 'Get membership',
          description:
            'One member — live or ended — with the login summary, roles, branches and staff profile. Requires membership:read.',
          tags: ['Membership'],
          params: membershipIdParamsDto,
        },
      },
      membershipController.getMembership,
    );
    zodApplication.get<{ Params: { membership_id: string } }>(
      '/organization/memberships/:membership_id/permissions',
      {
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.MEMBERSHIP_READ)],
        schema: {
          summary: 'Get membership permissions',
          description:
            "A live member's effective codes — every code of every role they hold, main and extra — as permission_codes. Requires membership:read.",
          tags: ['Membership'],
          params: membershipIdParamsDto,
        },
      },
      membershipController.getMembershipPermissions,
    );
    zodApplication.post(
      '/organization/memberships',
      {
        // R4: organization-scoped admin mutation — cap per (organization, actor) alongside the
        // required idempotency key.
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.MEMBERSHIP_CREATE)],
        schema: {
          summary: 'Add member by email',
          description:
            'Adds a member by email: provisions or resolves the login, creates an invited membership with the given roles (role_ids, main first) and staff profile (phone, tone, branch_ids, working days and hours, commission), and emails an invitation token. The same login added again gets its ended membership back. The invitee becomes active on accept. Outside production, with MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED on, invitation.debug_invitation_token carries the raw accept token (for local QA — the email never arrives). Requires membership:create.',
          tags: ['Membership'],
          body: createMembershipDto,
        },
      },
      membershipController.createMembership,
    );
    zodApplication.patch<{ Params: { membership_id: string } }>(
      '/organization/memberships/:membership_id',
      {
        // R4: organization-scoped admin mutation — cap per (organization, actor).
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.MEMBERSHIP_UPDATE)],
        schema: {
          summary: 'Update membership',
          description:
            "Changes a live member's status (active or suspended), roles (role_ids, main first — replaces the list) and staff profile; an ended member takes display_name only. The owner's status and roles cannot change. expected_updated_at refuses a stale save. Requires membership:update.",
          tags: ['Membership'],
          params: membershipIdParamsDto,
          body: updateMembershipDto,
        },
      },
      membershipController.updateMembership,
    );
    zodApplication.delete<{ Params: { membership_id: string } }>(
      '/organization/memberships/:membership_id',
      {
        // R4: organization-scoped admin mutation — cap per (organization, actor).
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.MEMBERSHIP_DELETE)],
        schema: {
          summary: 'Remove membership',
          description:
            'Removes a member from the organization, with why: reason (mistake, duplicate, not_needed, other) and a note, required for other. Undo with POST …/restore. Requires membership:delete.',
          tags: ['Membership'],
          params: membershipIdParamsDto,
          querystring: deleteMembershipQueryDto,
        },
      },
      membershipController.deleteMembership,
    );
    zodApplication.post<{ Params: { membership_id: string } }>(
      '/organization/memberships/:membership_id/restore',
      {
        // R4: organization-scoped admin mutation — cap per (organization, actor); T13: idempotent.
        config: { ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.MEMBERSHIP_DELETE)],
        schema: {
          summary: 'Restore membership',
          description:
            "Undoes a member's removal — the membership is live again with its status, roles, branches and profile, and its name follows the profile again; its API keys stay revoked. A live membership is a 409, as is a person who rejoined since, or no free seat; so is an end only the person can undo (409 `membership_not_restorable`: they left, deleted their account, declined, or their invite expired or was revoked). Restoring hands the roles back, so you must hold every code they grant (403). Requires membership:delete.",
          tags: ['Membership'],
          params: membershipIdParamsDto,
        },
      },
      membershipController.restoreMembership,
    );
    zodApplication.delete<{ Params: { membership_id: string } }>(
      '/organization/memberships/:membership_id/invitation',
      {
        // sec-r4-I3: invitation revocation is an organization-scoped admin mutation.
        ...ORGANIZATION_SCOPED_AUTHED_RATE_LIMIT,
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.MEMBERSHIP_DELETE)],
        schema: {
          summary: 'Revoke invitation',
          description:
            "Revokes an invited member's pending invite and removes the invited membership. As for a removal, you must hold every code the invited member's roles grant (403). Requires membership:delete.",
          tags: ['Invitation'],
          params: membershipIdParamsDto,
        },
      },
      membershipController.revokeInvitation,
    );
    zodApplication.post<{ Params: { membership_id: string } }>(
      '/organization/memberships/:membership_id/invitation/resend',
      {
        // T13: idempotent; strict cap — every resend sends an email.
        config: { ...STRICT_AUTHED_RATE_LIMIT.config, idempotencyRequired: true },
        onRequest: [app.authenticate],
        preHandler: [requireOrganizationPermission(TENANCY_PERMISSIONS.MEMBERSHIP_UPDATE)],
        schema: {
          summary: 'Resend invitation',
          description:
            "Resends an invited member's invite with a new token and expiry — an expired invite too. Returns the invitation; outside production, with MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED on, debug_invitation_token carries the new raw accept token. Requires membership:update.",
          tags: ['Invitation'],
          params: membershipIdParamsDto,
          body: resendMembershipInvitationDto,
        },
      },
      invitationController.resendInvitation,
    );
    zodApplication.post(
      '/organization/leave',
      {
        // sec-r4-I3: self-service exit revokes the caller's membership row.
        // Without a cap, a session-token holder (or compromised script) could
        // loop the endpoint against arbitrary organization ids to probe membership
        // existence by status code. Cap at the moderate-authed tier (30/60s).
        ...MODERATE_AUTHED_RATE_LIMIT,
        onRequest: [app.authenticate],
        schema: {
          summary: 'Leave organization',
          description:
            'Allows the authenticated user to leave the organization. Owners cannot leave without transferring ownership first.',
          tags: ['Membership'],
        },
      },
      membershipController.leaveOrganization,
    );
    zodApplication.post(
      '/organization/transfer-ownership',
      {
        // sec-r4-I3: ownership transfer is effectively irreversible (no
        // automatic recovery if the new owner is malicious). Cap at the
        // expensive-authed tier (5 req / 5 min) so a hijacked owner session
        // cannot pivot multiple tenants in rapid succession. Preserve
        // idempotencyRequired by merging into a single config object.
        config: { idempotencyRequired: true, ...EXPENSIVE_AUTHED_RATE_LIMIT.config },
        onRequest: [app.authenticate],
        // Effectively irreversible: a stolen owner access token alone must not be enough.
        preHandler: [requireRecentStepUpPreHandler],
        schema: {
          summary: 'Transfer organization ownership',
          description:
            "Transfers ownership of the organization to another active member. Only the current owner can perform this action. The Owner role becomes the new owner's main role (their previous main role stays as an extra role) and the former owner moves to the Admin role — or to `former_owner_role_id`, any role but the Owner role — in the same transaction. Requires a recent step-up on this session (`POST /auth/step-up`, within 10 minutes).",
          tags: ['Membership'],
          body: transferOwnershipDto,
        },
      },
      membershipController.transferOwnership,
    );

    // ── The invitee (cross-organization, signed in) ──
    zodApplication.post<{ Params: { membership_invitation_id: string } }>(
      '/membership-invitations/:membership_invitation_id/accept',
      {
        // sec-T4: accept requires authentication and (in the service) an invitee-email match —
        // anyone holding the invitation URL must not flip the victim's pending membership to active.
        // T13: idempotent.
        config: { ...STRICT_PUBLIC_RATE_LIMIT.config, idempotencyRequired: true },
        onRequest: [app.authenticate],
        schema: {
          summary: 'Accept invitation',
          description:
            'Accepts a pending invitation. Requires sign-in with the invited, verified email. The token from the invitation email is optional — without it the signed-in owner of that email accepts in the app (the invitation listed by GET /users/me/membership-invitations); a token that is sent must match. Activates the invited membership and returns the invitation with the organization_id just joined.',
          tags: ['Invitation'],
          params: membershipInvitationIdParamsDto,
          body: acceptMembershipInvitationDto,
        },
      },
      invitationController.acceptMembershipInvitation,
    );
    zodApplication.post<{ Params: { membership_invitation_id: string } }>(
      '/membership-invitations/:membership_invitation_id/decline',
      {
        // Launch D84 (3): bound to the invitee's verified email like accept; idempotent (T13).
        config: { ...STRICT_PUBLIC_RATE_LIMIT.config, idempotencyRequired: true },
        onRequest: [app.authenticate],
        schema: {
          summary: 'Decline invitation',
          description:
            'Turns down a pending invitation, expired or not. Requires sign-in with the invited, verified email. Revokes the invitation, ends the invited membership (end_reason declined), which frees its seat, and tells the inviter in the app. Returns the revoked invitation with the organization_id it was for.',
          tags: ['Invitation'],
          params: membershipInvitationIdParamsDto,
        },
      },
      invitationController.declineMembershipInvitation,
    );
  };
}
