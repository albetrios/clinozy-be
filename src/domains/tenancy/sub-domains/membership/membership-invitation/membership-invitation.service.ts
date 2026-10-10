import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/shared/errors/index.js';
import { env } from '@/shared/config/env.config.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
  type OrganizationPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';
import type { OrganizationRepository } from '@/domains/tenancy/sub-domains/organization/organization.repository.js';
import type { MembershipRepository } from '@/domains/tenancy/sub-domains/membership/membership.repository.js';
import type { UserService } from '@/domains/user/user.service.js';
import type { MembershipInvitationRepository } from './membership-invitation.repository.js';
import type {
  AcceptMembershipInvitationOutput,
  MembershipInvitationOutput,
  MembershipInvitationRow,
} from './membership-invitation.types.js';
import {
  validateAcceptMembershipInvitation,
  validateResendMembershipInvitation,
} from './membership-invitation.validator.js';
import { serializeMembershipInvitation } from './membership-invitation.serializer.js';
import { hashInvitationToken, generateInvitationToken } from './membership-invitation.token.js';
import { invalidatePermissions } from '@/domains/tenancy/sub-domains/permission/permission-cache.service.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { buildDomainEvent, eventBus } from '@/core/events/event-bus.js';
import {
  MEMBERSHIP_INVITATION_EVENT,
  type MembershipInvitationEmailPayload,
  type MembershipInvitationAcceptedPayload,
} from '@/domains/tenancy/sub-domains/membership/membership-invitation/events/membership-invitation.events.js';

const MEMBERSHIP_INVITATION_RESOURCE = 'Membership invitation';

function assertInvitationAcceptable(row: MembershipInvitationRow, now: Date): void {
  if (row.revoked_at) {
    throw new ValidationError('errors:validation.invitationRevoked', undefined, {}).withReason(
      'invitation_revoked',
    );
  }
  if (row.accepted_at) {
    throw new ValidationError(
      'errors:validation.invitationAlreadyAccepted',
      undefined,
      {},
    ).withReason('invitation_already_accepted');
  }
  if (now > row.expires_at) {
    throw new ValidationError('errors:validation.invitationExpired', undefined, {}).withReason(
      'invitation_expired',
    );
  }
}

function throwInvitationAcceptFailure(current: MembershipInvitationRow | null, now: Date): never {
  if (!current) throw new NotFoundError(MEMBERSHIP_INVITATION_RESOURCE);
  assertInvitationAcceptable(current, now);
  throw new ValidationError('errors:validation.invalidToken', undefined, {
    token: ['Invalid or expired'],
  });
}

/**
 * The dev-only accept-token echo (launch ROUTE #164, D82): the issue and resend answers carry the
 * raw token as `debug_invitation_token` when `MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED` is on — a
 * flag the env schema refuses outside the `local` and `development` targets.
 */
function withInvitationTokenEcho(
  output: MembershipInvitationOutput,
  token: string,
): MembershipInvitationOutput {
  return env.MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED
    ? { ...output, debug_invitation_token: token }
    : output;
}

/**
 * Optional per-command context for invitation create/resend.
 *
 * @remarks
 * - **Notes:** `requestId` propagates the originating HTTP request id into the
 *   post-commit mail dispatch so the durable Redis commit-dispatch entry
 *   survives a process crash; omit it on non-HTTP callers (the in-memory
 *   onCommit fallback is used instead).
 */
export interface MembershipInvitationCommandOptions {
  requestId?: string;
}

/**
 * Inputs to {@link MembershipInvitationService.createForMembership} — the invitation half of the
 * add-member-by-email flow (REQ-1). The membership is created first by `MembershipService.create`;
 * this issues the token + email for it.
 *
 * @remarks
 * - **Notes:** `invited_by_user_id` is the acting admin's internal id (the invitation's
 *   `invited_by_user_id` FK is NOT NULL); `inviter_label` is the display string for the email body;
 *   `requestId` propagates the HTTP request id into the post-commit mail dispatch (omit on non-HTTP
 *   callers). Carrier-only DTO — it holds no behavior.
 */
export interface CreateInvitationForMembershipParams {
  organization_name: string;
  organization_id: number;
  membership_id: number;
  membership_public_id: string;
  email: string;
  expires_in_days: number;
  invited_by_user_id: number;
  inviter_label: string;
  requestId?: string;
}

/**
 * Application service for organization-membership invitations: issue-for-membership, accept, resend,
 * and revoke.
 *
 * @remarks
 * - **Algorithm:** invitations carry a single-use opaque token. On issue/resend
 *   {@link generateInvitationToken} produces a 64-char hex secret; only the SHA-256 hash from
 *   {@link hashInvitationToken} is persisted as `token_hash`. Org-scoped methods (resend/revoke)
 *   run inside {@link withAppDatabaseContext}; {@link MembershipInvitationService.createForMembership}
 *   is called from within `MembershipService.create`'s existing organization transaction (it does not open its
 *   own). The public accept route has no organization context up front — it calls the SECURITY DEFINER lookup
 *   `lookupOrganizationByInvitationPublicId` to resolve the owning organization, then wraps the UPDATE in
 *   `withAppDatabaseContext`.
 * - **Failure modes:** `NotFoundError` for missing organization/membership/invitation; `ValidationError`
 *   (i18n keys `errors:validation.invalidToken`, `invitationRevoked`, `invitationAlreadyAccepted`,
 *   `invitationExpired`) for state/input violations; `ForbiddenError('errors:invitationRequiresVerifiedEmail')`
 *   when the accepting user's email is not verified; `ForbiddenError('errors:invitationEmailMismatch')`
 *   when the accepting user's email does not match the invitee.
 * - **Side effects:** writes to `tenancy.membership_invitations`; `accept` additionally activates the
 *   linked `tenancy.memberships` row (`status='active'`, `joined_at=now()`) and purges the member's
 *   Redis permission cache; `revoke` soft-deletes the auto-created `INVITED` membership so the members
 *   table shows no ghost invitee. Emits {@link MEMBERSHIP_INVITATION_EVENT.CREATED} / `RESENT` on the
 *   in-process event bus (the invitation-email handler turns these into a mail-outbox row dispatched on
 *   commit). The raw token is delivered **only** through the email — never in any HTTP response,
 *   except the dev-only `debug_invitation_token` echo on the issue and resend answers
 *   (`MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED`, refused outside local/development — ROUTE #164).
 *   Issue and resend use `emitStrict` so a failed outbox write rolls back the surrounding
 *   organization transaction, making token issuance and email delivery atomic.
 * - **Notes:** invitations have mutually-exclusive terminal states (`accepted_at` vs `revoked_at`);
 *   resend regenerates the token and pushes `expires_at`.
 */
export class MembershipInvitationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly invitationRepository: MembershipInvitationRepository,
    private readonly userService?: UserService,
  ) {}

  /**
   * Issues an invitation (token + email) for an already-created `INVITED` membership — the invitation
   * half of `MembershipService.create` (REQ-1).
   *
   * @remarks
   * - **Algorithm:** mints a single-use token, persists only its hash, and `emitStrict`s the CREATED
   *   mail event so the `token_hash` row and the secret-bearing outbox row commit atomically with the
   *   surrounding membership transaction.
   * - **Failure modes:** propagates a failed outbox write (rolls back the organization transaction).
   * - **Side effects:** INSERTs `membership_invitations`; enqueues the invitation email (raw token only via
   *   email, plus the dev-only `debug_invitation_token` echo on the answer when its flag is on).
   * - **Notes:** MUST be called inside the caller's `withAppDatabaseContext` (it does not open one).
   */
  async createForMembership(
    params: CreateInvitationForMembershipParams,
  ): Promise<MembershipInvitationOutput> {
    // Bound the organization's outstanding invitations (email-amplification / row-growth abuse).
    // Runs inside MembershipService.create's organization transaction, so the advisory lock serializes the
    // count + insert — two concurrent invites cannot both pass the same count and overshoot the cap.
    await this.invitationRepository.acquireCreationQuotaLock(params.organization_id);
    const pendingCount = await this.invitationRepository.countPendingByOrganization(
      params.organization_id,
    );
    if (pendingCount >= env.INVITATION_MAX_PENDING_PER_ORG) {
      throw new ConflictError('errors:membershipInvitationMaxReached', {
        max: env.INVITATION_MAX_PENDING_PER_ORG,
      });
    }
    const token = generateInvitationToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + params.expires_in_days);
    const row = await this.invitationRepository.create({
      membership_id: params.membership_id,
      email: params.email,
      token_hash: hashInvitationToken(token),
      invited_by_user_id: params.invited_by_user_id,
      expires_at: expiresAt,
      created_by_user_id: params.invited_by_user_id,
    });
    const output = serializeMembershipInvitation(row, params.membership_public_id);
    await eventBus.emitStrict(
      buildDomainEvent(
        MEMBERSHIP_INVITATION_EVENT.CREATED,
        {
          email: params.email,
          organization_name: params.organization_name,
          inviter_name: params.inviter_label,
          token,
          invitation_public_id: output.id,
          expires_in_days: params.expires_in_days,
        } satisfies MembershipInvitationEmailPayload,
        params.requestId !== undefined ? { requestId: params.requestId } : undefined,
      ),
    );
    return withInvitationTokenEcho(output, token);
  }

  async accept(
    invitation_public_id: string,
    body: unknown,
    actingUserPublicId: string,
  ): Promise<AcceptMembershipInvitationOutput> {
    const parsed = validateAcceptMembershipInvitation(body);
    // sec-T4: previously accept was unauthenticated, so anyone with the
    // invitation URL could flip the victim's pending membership to ACTIVE.
    // Bind the acting user's email to the invitee email so a forwarded
    // invitation link cannot be accepted by anyone but the invitee.
    if (!this.userService) {
      throw new Error(
        'UserService is not configured on MembershipInvitationService. Wire it via tenancy.container.',
      );
    }
    const actingUser = await this.userService.requireUserRecordByPublicId(actingUserPublicId);
    if (!actingUser) throw new NotFoundError('User');
    // sec-T4 follow-up: require a VERIFIED email to join an organization. email-code / OAuth onboarding prove
    // email control (and set is_email_verified); an email/password signup-claim of a pre-provisioned
    // invited account stays unverified until the emailed code is entered. Without this, someone merely
    // FORWARDED the invite email could claim the invited address via password signup and accept —
    // re-opening exactly the takeover the email-match check (below) was added to close.
    if (!actingUser.is_email_verified) {
      throw new ForbiddenError('errors:invitationRequiresVerifiedEmail');
    }
    /**
     * Public route: no organization context up front. Resolve the owning organization via the
     * SECURITY DEFINER lookup, then wrap the read + UPDATE in
     * `withAppDatabaseContext` so RLS sees the organization GUC.
     */
    const lookup =
      await this.invitationRepository.lookupOrganizationByInvitationPublicId(invitation_public_id);
    if (!lookup) throw new NotFoundError(MEMBERSHIP_INVITATION_RESOURCE);
    let acceptedMemberPublicId: string | null = null;
    const result = await withAppDatabaseContext(
      PRINCIPAL_SCOPE.VERIFIED({ organizationPublicId: lookup.organization_public_id }),
      async () => {
        const row = await this.invitationRepository.findByPublicId(invitation_public_id);
        if (!row) throw new NotFoundError(MEMBERSHIP_INVITATION_RESOURCE);
        if (row.email.toLowerCase() !== actingUser.email.toLowerCase()) {
          throw new ForbiddenError('errors:invitationEmailMismatch');
        }
        const tokenHash = hashInvitationToken(parsed.token);
        const now = new Date();
        assertInvitationAcceptable(row, now);
        const updated = await this.invitationRepository.accept(
          invitation_public_id,
          tokenHash,
          now,
        );
        if (!updated) {
          const current = await this.invitationRepository.findByPublicId(invitation_public_id);
          throwInvitationAcceptFailure(current, now);
        }
        /**
         * Atomically activate the membership in the same transaction so accepting
         * the token actually grants access (permission resolution requires
         * `memberships.status = 'active'`). Without this the invitation flow set
         * `accepted_at` but left the membership `INVITED`, so the user appeared
         * to have no access until a manager separately PATCHed the status.
         */
        const activatedMembership = await this.membershipRepository.activateForInvitationAccept(
          lookup.membership_id,
          lookup.organization_id,
        );
        if (!activatedMembership) throw new NotFoundError('Membership');
        acceptedMemberPublicId =
          (await this.organizationRepository.resolveUserPublicIdByInternalId(
            activatedMembership.user_id,
          )) ?? null;
        // Item #10: notify the members who can add members (`membership:create`) that the invite was accepted.
        // Recipients are resolved HERE (inside the organization RLS context, minus the invitee) so the notify
        // handler only fans out. Emitted via `emit` (which swallows handler errors) and wrapped so a
        // notification-path failure can NEVER roll back the accept.
        try {
          const managerUserIds = await this.membershipRepository.findUserIdsWithPermission(
            lookup.organization_id,
            TENANCY_PERMISSIONS.MEMBERSHIP_CREATE,
          );
          const recipientUserIds = managerUserIds.filter(
            (userId) => userId !== activatedMembership.user_id,
          );
          if (recipientUserIds.length > 0) {
            const organization = await this.organizationRepository.findByPublicId(
              lookup.organization_public_id,
            );
            const inviteeName =
              [actingUser.first_name, actingUser.last_name].filter(Boolean).join(' ').trim() ||
              actingUser.email;
            await eventBus.emit(
              buildDomainEvent(MEMBERSHIP_INVITATION_EVENT.ACCEPTED, {
                recipient_user_ids: recipientUserIds,
                organization_id: lookup.organization_id,
                organization_name: organization?.name ?? '',
                invitee_name: inviteeName,
              } satisfies MembershipInvitationAcceptedPayload),
            );
          }
        } catch (error) {
          logger.error(
            { err: error, invitationPublicId: invitation_public_id },
            'membership_invitation.accept.notify_failed',
          );
        }
        return serializeMembershipInvitation(updated, lookup.membership_public_id);
      },
    );
    // sec-R11: invalidate AFTER commit so the newly-activated member's permissions are recomputed
    // from the committed ACTIVE membership — a pre-commit invalidation could be re-populated with
    // the stale (pre-acceptance) set by a concurrent recompute, delaying the access grant.
    if (acceptedMemberPublicId) {
      await invalidatePermissions(acceptedMemberPublicId, lookup.organization_public_id);
    }
    // Return the joined org's public id alongside the invitation so the client can
    // POST /auth/switch-to-organization into it without a separate lookup (gate reduction).
    return { ...result, organization_id: lookup.organization_public_id };
  }

  /**
   * Revokes a membership's pending invite (launch §2.C route 9) — the half of revoking that touches
   * the invitation; `MembershipService.revokeInvitation` ends the invited membership in the same
   * transaction.
   *
   * @remarks
   * - **Algorithm:** the membership's latest invitation; nothing pending (none, accepted or already
   *   revoked) → `null`.
   * - **Failure modes:** none of its own — the caller turns `null` into a 404.
   * - **Notes:** MUST run inside the caller's organization context.
   */
  async revokePendingForMembership(membership_id: number): Promise<MembershipInvitationRow | null> {
    const latest = await this.invitationRepository.findLatestByMembershipId(membership_id);
    if (!latest || latest.accepted_at || latest.revoked_at) return null;
    return this.invitationRepository.revoke(latest.public_id);
  }

  /**
   * Resends a member's invite with a new token and expiry (launch §2.C route 10). An expired invite
   * can be resent (T11); an accepted or revoked one cannot.
   *
   * @remarks
   * - **Algorithm:** inside the organization context — the live member, its latest invitation, then
   *   the rotated token and expiry; the RESENT mail event commits with it (`emitStrict`).
   * - **Failure modes:** `NotFoundError` for an unknown or ended member, or one with no invitation;
   *   `ValidationError` `invitation_already_accepted` / `invitation_revoked`.
   * - **Side effects:** rotates `token_hash` and `expires_at`; enqueues the invitation email (the raw
   *   token only via email, plus the dev-only `debug_invitation_token` echo on the answer when its
   *   flag is on).
   */
  async resendForMembership(
    scope: OrganizationPrincipalDatabaseScope,
    membership_public_id: string,
    body: unknown,
    options?: MembershipInvitationCommandOptions,
  ): Promise<MembershipInvitationOutput> {
    const organization_public_id = scope.organizationPublicId;
    const parsed = validateResendMembershipInvitation(body);
    return withAppDatabaseContext(scope, async () => {
      const organization = await this.organizationRepository.findByPublicId(organization_public_id);
      if (!organization) throw new NotFoundError('Organization');
      const membership = await this.membershipRepository.findByPublicId(
        membership_public_id,
        organization.id,
      );
      if (!membership) throw new NotFoundError('Membership');
      const row = await this.invitationRepository.findLatestByMembershipId(membership.id);
      if (!row) throw new NotFoundError(MEMBERSHIP_INVITATION_RESOURCE);
      if (row.accepted_at) {
        throw new ValidationError(
          'errors:validation.invitationAlreadyAccepted',
          undefined,
          {},
        ).withReason('invitation_already_accepted');
      }
      if (row.revoked_at) {
        throw new ValidationError('errors:validation.invitationRevoked', undefined, {}).withReason(
          'invitation_revoked',
        );
      }
      // T11: an expired invite gets a new token and a new expiry like any other.
      const token = generateInvitationToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parsed.expires_in_days);
      const updated = await this.invitationRepository.resend(
        row.public_id,
        hashInvitationToken(token),
        expiresAt,
      );
      if (!updated) throw new NotFoundError(MEMBERSHIP_INVITATION_RESOURCE);
      const output = serializeMembershipInvitation(updated, membership.public_id);

      // R2: emitStrict so the rotated token_hash (already persisted above in this
      // same organization transaction) and the new outbox row commit atomically. The old
      // token was overwritten by `resend`, so a swallowed email failure would
      // otherwise leave the invitee with no working link and no error surfaced.
      await eventBus.emitStrict(
        buildDomainEvent(
          MEMBERSHIP_INVITATION_EVENT.RESENT,
          {
            email: row.email,
            organization_name: organization.name ?? organization.public_id,
            inviter_name: 'Team member',
            token,
            invitation_public_id: output.id,
            expires_in_days: parsed.expires_in_days,
          } satisfies MembershipInvitationEmailPayload,
          options?.requestId !== undefined ? { requestId: options.requestId } : undefined,
        ),
      );

      return withInvitationTokenEcho(output, token);
    });
  }
}
